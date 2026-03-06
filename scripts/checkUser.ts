import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

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

async function checkOrCreateUser(email: string, password: string, displayName: string, role: 'admin' | 'staff' | 'teacher' | 'student' = 'staff') {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    
    console.log(`\n🔍 Checking user: ${normalizedEmail}`);
    
    // Tìm user trong Firestore
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      console.log('✅ User found!');
      console.log('📋 User details:');
      console.log('  - UID:', userDoc.id);
      console.log('  - Email:', userData.email);
      console.log('  - Display Name:', userData.displayName);
      console.log('  - Role:', userData.role);
      console.log('  - Approved:', userData.approved);
      console.log('  - Password:', userData.password ? `${userData.password.substring(0, 3)}...` : 'NOT SET');
      console.log('  - Password length:', userData.password?.length || 0);
      
      // Kiểm tra mật khẩu
      const storedPassword = userData.password?.trim() || '';
      const inputPassword = password.trim();
      
      if (storedPassword === inputPassword) {
        console.log('✅ Password matches!');
      } else {
        console.log('❌ Password does NOT match!');
        console.log('  - Stored password:', storedPassword.substring(0, 3) + '...');
        console.log('  - Input password:', inputPassword.substring(0, 3) + '...');
        console.log('  - Stored length:', storedPassword.length);
        console.log('  - Input length:', inputPassword.length);
      }
      
      // Kiểm tra approved
      if (userData.role !== 'admin' && userData.approved === false) {
        console.log('⚠️  Account is NOT approved!');
      } else {
        console.log('✅ Account is approved!');
      }
      
      return userData;
    } else {
      console.log('❌ User NOT found!');
      console.log('📝 Creating new user...');
      
      const newUserId = `${role}_${Date.now()}`;
      const newUser = {
        uid: newUserId,
        email: normalizedEmail,
        password: password.trim(),
        displayName: displayName,
        role: role,
        approved: role === 'admin' ? true : false,
        totalLearningHours: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await setDoc(doc(db, 'users', newUserId), newUser);
      console.log('✅ User created successfully!');
      console.log('📋 New user details:');
      console.log('  - UID:', newUserId);
      console.log('  - Email:', normalizedEmail);
      console.log('  - Password:', password.trim());
      console.log('  - Role:', role);
      console.log('  - Approved:', newUser.approved);
      
      return newUser;
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Chạy script
const email = process.argv[2] || 'ketoankama@gmail.com';
const password = process.argv[3] || '123456';
const displayName = process.argv[4] || 'Kế Toán Kama';
const role = (process.argv[5] as any) || 'staff';

checkOrCreateUser(email, password, displayName, role)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
