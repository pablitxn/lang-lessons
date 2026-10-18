/** Role names are confirmed; capability grants remain server policy (Q10). */
export type Role = 'administrator' | 'professor' | 'student';
export interface Capabilities { readonly granted: readonly string[] }
export interface CurrentUser { readonly id: string; readonly role: Role; readonly capabilities: Capabilities }
/** No password, auth session, role mutation or unapproved personal fields. */
export interface PublicUser { readonly id: string; readonly role: Role }
