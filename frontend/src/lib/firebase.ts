import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyDqzQ8D8e8wDM8wgw57l_1SZDzZjNdy3Y4',
  authDomain: 'pdv-lanchonete-1fa79.firebaseapp.com',
  projectId: 'pdv-lanchonete-1fa79',
  appId: '1:815168925:web:96c10004b3a546fe600374',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
