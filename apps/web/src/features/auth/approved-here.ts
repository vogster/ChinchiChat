/** Sign-ins approved in this tab: the "new sign-in" notice about them is not for it. */
const approved = new Set<string>()

export const markApprovedHere = (qrLoginId: string): void => {
  approved.add(qrLoginId)
}

export const approvedHere = (qrLoginId: string): boolean => approved.has(qrLoginId)
