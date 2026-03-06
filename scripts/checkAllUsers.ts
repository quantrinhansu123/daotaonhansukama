import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDhc9bWAA8h1bqXEZcW0tq7j9t5lTQeoN4",
  authDomain: "classroom-257dc.firebaseapp.com",
  databaseURL: "https://classroom-257dc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "classroom-257dc",
  storageBucket: "classroom-257dc.firebasestorage.app",
  messagingSenderId: "376090394045",
  appId: "1:376090394045:web:d99dedd72d3a02f96966d4",
  measurementId: "G-NS5J50BB0F"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkAllUsers() {
  try {
    console.log('\n🔍 Fetching all users from Firestore...\n');
    
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);
    
    console.log(`📊 Total users: ${snapshot.size}\n`);
    
    snapshot.docs.forEach((doc, index) => {
      const user = doc.data();
      const email = user.email || '';
      const normalizedEmail = email.trim().toLowerCase();
      
      console.log(`User ${index + 1}:`);
      console.log('  - UID:', doc.id);
      console.log('  - Email (raw):', JSON.stringify(email));
      console.log('  - Email (normalized):', normalizedEmail);
      console.log('  - Email length:', email.length);
      console.log('  - Has spaces:', email.includes(' '));
      console.log('  - Display Name:', user.displayName);
      console.log('  - Role:', user.role);
      console.log('  - Approved:', user.approved);
      console.log('');
    });
    
    // Tìm user với email ketoankama@gmail.com
    const targetEmail = 'ketoankama@gmail.com';
    const targetNormalized = targetEmail.toLowerCase();
    
    console.log(`\n🔎 Searching for: ${targetEmail}`);
    console.log(`   Normalized: ${targetNormalized}\n`);
    
    const foundUsers = snapshot.docs.filter(doc => {
      const email = doc.data().email?.trim().toLowerCase() || '';
      return email === targetNormalized;
    });
    
    if (foundUsers.length > 0) {
      console.log(`✅ Found ${foundUsers.length} user(s):\n`);
      foundUsers.forEach((doc, index) => {
        const user = doc.data();
        console.log(`Match ${index + 1}:`);
        console.log('  - UID:', doc.id);
        console.log('  - Email:', user.email);
        console.log('  - Display Name:', user.displayName);
        console.log('  - Role:', user.role);
        console.log('');
      });
    } else {
      console.log('❌ No user found with that email\n');
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAllUsers();
