import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { GraphqlService } from './graphql-service';
import { ThemePreference, UserSettings } from './models';

const USER_SETTINGS_FIELDS = `
  themePreference
`;

/**
 * Reads and writes the signed-in user's account settings via GraphQL. The
 * settings are persisted server-side (so they follow the user across devices);
 * {@link ThemeService} layers a localStorage cache on top for an instant,
 * flash-free boot.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly graphql = inject(GraphqlService);

  getUserSettings(): Observable<UserSettings> {
    return this.graphql
      .request<{
        userSettings: UserSettings;
      }>(`query { userSettings { ${USER_SETTINGS_FIELDS} } }`)
      .pipe(map((data) => data.userSettings));
  }

  setThemePreference(themePreference: ThemePreference): Observable<UserSettings> {
    return this.graphql
      .request<{ setThemePreference: UserSettings }>(
        `mutation SetTheme($themePreference: ThemePreference!) {
          setThemePreference(themePreference: $themePreference) {
            ${USER_SETTINGS_FIELDS}
          }
        }`,
        { themePreference },
      )
      .pipe(map((data) => data.setThemePreference));
  }
}
