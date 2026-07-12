/** Twitter アカウント切断 Server Action の共有型・定数(ADR-014)。 */

export interface DisconnectTwitterFormState {
  ok: boolean;
  formError?: string;
}

export const INITIAL_DISCONNECT_TWITTER_FORM_STATE: DisconnectTwitterFormState = {
  ok: false,
};
