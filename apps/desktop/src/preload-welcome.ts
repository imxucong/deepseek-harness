import type { AccountProviderId, AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
/** Localized welcome copy and write-only credential actions. */

import { contextBridge, ipcRenderer } from 'electron'
import { resolveDesktopLocale } from './locale.ts'
import { WELCOME_IPC, type WelcomeApi, type WelcomeNotice, type WelcomeSaveResult } from './welcome-api.ts'

const prefix = '--dsh-welcome-locale='
const locale = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length)
if (locale === undefined) throw new Error('desktop welcome: missing window locale')
const api: WelcomeApi = {
  ...resolveDesktopLocale(locale),
  analytics: async (eventName, attributes) => {
    if (await api.analyticsEnabled()) await ipcRenderer.invoke(WELCOME_IPC.analytics, eventName, attributes)
  },
  analyticsEnabled: () => ipcRenderer.invoke(WELCOME_IPC.analyticsEnabled) as Promise<boolean>,
  takeNotice: () => ipcRenderer.invoke(WELCOME_IPC.takeNotice) as Promise<WelcomeNotice | undefined>,
  providers: () => ipcRenderer.invoke(WELCOME_IPC.providers) as Promise<AccountProviderId[]>,
  startSignIn: (provider: AccountProviderId) =>
    ipcRenderer.invoke(WELCOME_IPC.start, provider) as Promise<AccountView>,
  cancelSignIn: (provider: AccountProviderId, id: SignInAttemptId) =>
    ipcRenderer.invoke(WELCOME_IPC.cancel, provider, id) as Promise<AccountView>,
  copySignInLink: (provider: AccountProviderId, id: SignInAttemptId) =>
    ipcRenderer.invoke(WELCOME_IPC.copyLink, provider, id) as Promise<void>,
  onAccountState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, provider: AccountProviderId, state: AccountView): void => {
      listener(provider, state)
    }
    ipcRenderer.on(WELCOME_IPC.state, receive)
    return () => { ipcRenderer.removeListener(WELCOME_IPC.state, receive) }
  },
  saveApiKey: (value: string) => ipcRenderer.invoke(WELCOME_IPC.saveApiKey, value) as Promise<WelcomeSaveResult>,
  skip: () => ipcRenderer.invoke(WELCOME_IPC.skip) as Promise<void>,
}
contextBridge.exposeInMainWorld('dshWelcome', api)
