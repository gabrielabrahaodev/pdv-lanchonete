import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  updatePassword,
  verifyBeforeUpdateEmail,
} from 'firebase/auth'
import { auth } from './firebase'
import { api } from './api'
export const MENSAGEM_RECUPERACAO =
  'Se houver uma conta apta para este endereço, você receberá as instruções de recuperação. Confira também o spam.'
export async function recuperarSenha(email: string) {
  // A mesma resposta para conta existente, inexistente e falhas de envio evita enumeração.
  try {
    auth.languageCode = 'pt-BR'
    await sendPasswordResetEmail(auth, email.trim())
  } catch {
    /* resposta pública uniforme */
  }
  return MENSAGEM_RECUPERACAO
}
async function reautenticar(senha: string) {
  const user = auth.currentUser
  if (!user?.email)
    throw new Error('Entre novamente para atualizar suas credenciais.')
  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email, senha),
  )
  return user
}
export async function mudarSenha(atual: string, nova: string) {
  const user = await reautenticar(atual)
  await api('/usuarios/me/seguranca', {
    method: 'POST',
    body: { acao: 'solicitar_troca_senha' },
  })
  await updatePassword(user, nova)
}
export async function solicitarEmail(atual: string, novo: string) {
  const user = await reautenticar(atual)
  auth.languageCode = 'pt-BR'
  await api('/usuarios/me/seguranca', {
    method: 'POST',
    body: { acao: 'solicitar_troca_email' },
  })
  await verifyBeforeUpdateEmail(user, novo.trim())
}
export function erroConta(e: unknown) {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('too-many-requests'))
    return 'Muitas tentativas. Aguarde antes de tentar novamente.'
  if (code.includes('weak-password'))
    return 'Use uma senha mais forte, conforme a política de segurança da conta.'
  if (
    code.includes('requires-recent-login') ||
    code.includes('invalid-credential') ||
    code.includes('wrong-password')
  )
    return 'Confirme sua senha atual ou entre novamente.'
  if (code.includes('email-already-in-use') || code.includes('invalid-email'))
    return 'Não foi possível usar este e-mail. Confira o endereço informado.'
  return e instanceof Error && !code
    ? e.message
    : 'Não foi possível concluir. Confira os dados e a conexão.'
}
