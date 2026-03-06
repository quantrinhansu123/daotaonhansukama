'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile, UserRole } from '@/types/user';

interface AuthContextType {
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile | null>;
  signUp: (email: string, password: string, displayName: string, role: UserRole, additionalInfo?: Partial<UserProfile>) => Promise<UserProfile>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Kiểm tra session từ localStorage
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setUserProfile(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // Chuẩn hóa email và password (trim whitespace, lowercase email)
      const normalizedEmail = email.trim().toLowerCase();
      const originalEmail = email.trim();
      const normalizedPassword = password.trim();
      
      console.log('[Login] Attempting login for email:', normalizedEmail);
      console.log('[Login] Original email:', originalEmail);
      
      // Tìm user trong Firestore - sử dụng fallback method ngay từ đầu để đảm bảo tìm thấy
      const usersRef = collection(db, 'users');
      let querySnapshot: any = { empty: true, docs: [], size: 0 };
      
      // Phương pháp 1: Query với where clause (nhanh hơn nhưng có thể không hoạt động)
      try {
        console.log('[Login] Method 1: Trying Firestore query...');
        const q = query(usersRef, where('email', '==', normalizedEmail));
        const result = await Promise.race([
          getDocs(q),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 5000))
        ]) as any;
        
        if (!result.empty) {
          console.log('[Login] ✅ Found user via Firestore query');
          querySnapshot = result;
        } else {
          console.log('[Login] Query returned empty, trying fallback...');
        }
      } catch (queryError: any) {
        console.warn('[Login] Firestore query failed:', queryError.message);
        console.log('[Login] Falling back to fetch-all method...');
      }
      
      // Phương pháp 2: Fallback - lấy tất cả users và tìm trong memory (luôn hoạt động)
      if (querySnapshot.empty) {
        console.log('[Login] Method 2: Fetching all users and searching in memory...');
        try {
          const allUsersSnapshot = await Promise.race([
            getDocs(usersRef),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 10000))
          ]) as any;
          
          console.log('[Login] Total users fetched:', allUsersSnapshot.size);
          
          // Log tất cả emails để debug
          console.log('[Login] All emails in database:');
          allUsersSnapshot.docs.forEach((doc: any, index: number) => {
            const userEmail = doc.data().email || '';
            console.log(`  ${index + 1}. "${userEmail}" (normalized: "${userEmail.trim().toLowerCase()}")`);
          });
          
          // Tìm user bằng cách so sánh email không phân biệt hoa thường
          const foundDoc = allUsersSnapshot.docs.find((doc: any) => {
            const userEmail = doc.data().email?.trim().toLowerCase() || '';
            const matches = userEmail === normalizedEmail;
            if (matches) {
              console.log('[Login] ✅ Match found! Email:', doc.data().email);
            }
            return matches;
          });
          
          if (foundDoc) {
            console.log('[Login] ✅ Found user via fallback method');
            querySnapshot = {
              empty: false,
              docs: [foundDoc],
              size: 1
            };
          } else {
            console.log('[Login] ❌ User not found even in fallback method');
            console.log('[Login] Looking for:', normalizedEmail);
            console.log('[Login] Available emails:', allUsersSnapshot.docs.map((d: any) => d.data().email?.trim().toLowerCase()));
          }
        } catch (fallbackError: any) {
          console.error('[Login] Fallback method failed:', fallbackError.message);
          console.error('[Login] Error details:', fallbackError);
        }
      }

      // Nếu không tìm thấy user
      if (querySnapshot.empty) {
        console.error('[Login] User not found with email:', normalizedEmail);
        console.error('[Login] Also tried:', originalEmail);
        throw new Error('Email hoặc mật khẩu không đúng');
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as UserProfile;

      console.log('[Login] User found:', {
        email: userData.email,
        role: userData.role,
        approved: userData.approved,
        hasPassword: !!userData.password,
        passwordLength: userData.password?.length
      });

      // Kiểm tra mật khẩu (so sánh đã trim)
      const storedPassword = userData.password?.trim() || '';
      if (storedPassword !== normalizedPassword) {
        console.error('[Login] Password mismatch:', {
          storedLength: storedPassword.length,
          inputLength: normalizedPassword.length,
          storedPassword: storedPassword.substring(0, 3) + '...',
          inputPassword: normalizedPassword.substring(0, 3) + '...'
        });
        throw new Error('Email hoặc mật khẩu không đúng');
      }
      
      // Kiểm tra tài khoản đã được duyệt chưa (trừ admin)
      if (userData.role !== 'admin' && userData.approved === false) {
        console.warn('[Login] Account not approved:', userData.role);
        throw new Error('Tài khoản của bạn chưa được duyệt. Vui lòng liên hệ quản trị viên.');
      }

      console.log('[Login] Login successful for:', normalizedEmail);

      // Lưu vào localStorage
      localStorage.setItem('currentUser', JSON.stringify(userData));
      setUserProfile(userData);
      
      return userData;
    } catch (error: any) {
      console.error('[Login] Error:', error.message);
      throw new Error(error.message || 'Đăng nhập thất bại');
    }
  };

  const signUp = async (email: string, password: string, displayName: string, role: UserRole, additionalInfo?: Partial<UserProfile>) => {
    try {
      // Kiểm tra email đã tồn tại chưa
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        throw new Error('Email đã được sử dụng');
      }

      // Tạo user mới
      const newUser: UserProfile = {
        uid: `user_${Date.now()}`,
        email: email,
        password: password,
        displayName: displayName,
        role: role,
        approved: role === 'admin' ? true : false, // Admin tự động duyệt, còn lại cần duyệt
        ...additionalInfo, // Thêm các thông tin bổ sung
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Lưu vào Firestore
      await setDoc(doc(db, 'users', newUser.uid), newUser);

      // Lưu vào localStorage
      localStorage.setItem('currentUser', JSON.stringify(newUser));
      setUserProfile(newUser);

      return newUser;
    } catch (error: any) {
      throw new Error(error.message || 'Đăng ký thất bại');
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('currentUser');
      setUserProfile(null);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const value = {
    userProfile,
    loading,
    signIn,
    signUp,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
