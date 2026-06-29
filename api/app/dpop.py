"""DPoP (RFC 9449) proof validation for the resource server.

When an access token is sender-constrained it carries a ``cnf.jkt`` confirmation
claim (the SHA-256 thumbprint of the client's public key). The client must then
prove possession of the matching private key on every request by sending a
per-request DPoP proof JWT in the ``DPoP`` header. Validating that proof — and
that it is bound both to *this* request and to the *presented* access token — is
what makes a stolen access token useless on its own.

Auth0 performs the nonce handshake at the token endpoint, so a resource-server
nonce is optional (RFC 9449 §8). Freshness here therefore relies on the ``iat``
window plus a ``jti`` replay cache.
"""

from __future__ import annotations

import base64
import hashlib
import json
import time
from urllib.parse import urlsplit, urlunsplit

import jwt
from jwt.algorithms import ECAlgorithm, OKPAlgorithm, RSAAlgorithm

from app.auth import AuthError
from app.config import settings

# Asymmetric proof-signing algorithms we accept. Symmetric algorithms and
# "none" are rejected by omission: a DPoP proof is self-signed with its embedded
# public key, so only public-key algorithms are meaningful.
_ALLOWED_PROOF_ALGS = {"ES256", "ES384", "ES512", "RS256", "PS256", "EdDSA"}
_JWK_ALGORITHMS = {"EC": ECAlgorithm, "RSA": RSAAlgorithm, "OKP": OKPAlgorithm}
_DEFAULT_PORTS = {"http": "80", "https": "443"}


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def normalize_htu(url: str) -> str:
    """Normalize an HTTP URI for ``htu`` comparison (RFC 9449 §4.3).

    Drops the query and fragment, lower-cases the scheme/host and removes a
    redundant default port, so equivalent URLs compare equal across the proxy.
    """
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    netloc = host
    if parts.port is not None and str(parts.port) != _DEFAULT_PORTS.get(scheme):
        netloc = f"{host}:{parts.port}"
    return urlunsplit((scheme, netloc, parts.path or "/", "", ""))


def jwk_thumbprint(jwk: dict) -> str:
    """RFC 7638 JWK SHA-256 thumbprint, base64url-encoded (the ``jkt`` value)."""
    kty = jwk.get("kty")
    if kty == "EC":
        members = {"crv": jwk["crv"], "kty": "EC", "x": jwk["x"], "y": jwk["y"]}
    elif kty == "RSA":
        members = {"e": jwk["e"], "kty": "RSA", "n": jwk["n"]}
    elif kty == "OKP":
        members = {"crv": jwk["crv"], "kty": "OKP", "x": jwk["x"]}
    else:
        raise AuthError(f"Unsupported DPoP key type '{kty}'.")
    canonical = json.dumps(members, separators=(",", ":"), sort_keys=True)
    return _b64url(hashlib.sha256(canonical.encode("ascii")).digest())


class ReplayCache:
    """In-memory ``jti`` replay guard with lazy expiry.

    NOTE: process-local. With more than one API worker/instance a shared store
    (Redis, database) is required for replay protection to hold across the fleet.
    """

    def __init__(self) -> None:
        self._seen: dict[str, float] = {}

    def check_and_add(self, jti: str, expires_at: float) -> None:
        now = time.time()
        if self._seen:  # opportunistic eviction to bound memory
            for key in [k for k, exp in self._seen.items() if exp <= now]:
                del self._seen[key]
        if jti in self._seen:
            raise AuthError("DPoP proof has already been used (replay detected).")
        self._seen[jti] = expires_at


_replay_cache = ReplayCache()


def verify_dpop_proof(
    proof: str,
    *,
    access_token: str,
    htm: str,
    htu: str,
    cnf_jkt: str | None,
) -> None:
    """Validate a DPoP proof JWT and its binding to the request + access token.

    ``cnf_jkt`` is the thumbprint the access token committed to (its ``cnf.jkt``
    claim); the proof's public key must hash to it. Raises :class:`AuthError`
    on any failure.
    """
    if not cnf_jkt:
        # A DPoP proof / scheme was used with a token that is not sender-
        # constrained. Refuse rather than silently accept a downgraded request.
        raise AuthError("Access token is not DPoP-bound (missing cnf.jkt).")

    try:
        header = jwt.get_unverified_header(proof)
    except jwt.PyJWTError as exc:
        raise AuthError(f"Malformed DPoP proof: {exc}") from exc

    if header.get("typ") != "dpop+jwt":
        raise AuthError("DPoP proof has an invalid 'typ' header.")
    alg = header.get("alg")
    if alg not in _ALLOWED_PROOF_ALGS:
        raise AuthError(f"Unsupported DPoP proof algorithm '{alg}'.")
    jwk = header.get("jwk")
    if not isinstance(jwk, dict):
        raise AuthError("DPoP proof is missing its 'jwk' header.")
    if "d" in jwk or "k" in jwk:
        # Must carry a public key only — never private or symmetric material.
        raise AuthError("DPoP proof 'jwk' must be a public key.")

    algorithm = _JWK_ALGORITHMS.get(jwk.get("kty"))
    if algorithm is None:
        raise AuthError(f"Unsupported DPoP key type '{jwk.get('kty')}'.")
    try:
        key = algorithm.from_jwk(json.dumps(jwk))
        claims = jwt.decode(
            proof,
            key,
            algorithms=[alg],
            options={"require": ["iat", "jti", "htm", "htu"], "verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise AuthError(f"Invalid DPoP proof signature: {exc}") from exc

    # The proof's key must be exactly the one the access token is bound to.
    if jwk_thumbprint(jwk) != cnf_jkt:
        raise AuthError("DPoP proof key does not match the access token (cnf.jkt).")

    # Bound to this exact request.
    if str(claims.get("htm", "")).upper() != htm.upper():
        raise AuthError("DPoP proof 'htm' does not match the request method.")
    if normalize_htu(str(claims.get("htu", ""))) != normalize_htu(htu):
        raise AuthError("DPoP proof 'htu' does not match the request URL.")

    # Bound to the presented access token.
    expected_ath = _b64url(hashlib.sha256(access_token.encode("ascii")).digest())
    if claims.get("ath") != expected_ath:
        raise AuthError("DPoP proof 'ath' does not match the access token.")

    # Freshness + single use.
    iat = claims.get("iat")
    leeway = settings.dpop_iat_leeway_seconds
    if not isinstance(iat, (int, float)) or abs(time.time() - iat) > leeway:
        raise AuthError("DPoP proof is stale or has an invalid 'iat'.")
    _replay_cache.check_and_add(str(claims["jti"]), expires_at=iat + leeway)
