/** Twitter OAuth 開始 Server Action の共有型・定数(ADR-014)。 */

export interface InitiateTwitterOAuthFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_INITIATE_TWITTER_OAUTH_FORM_STATE: InitiateTwitterOAuthFormState = {
  ok: false,
};
