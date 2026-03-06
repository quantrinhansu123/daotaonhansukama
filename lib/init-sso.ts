"use client";

import { initSSOListener } from "./sso-listener";
import { db } from "./firebase";
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from "firebase/firestore";

// Hàm đăng nhập - chỉ sử dụng Firebase
async function handleLogin(email: string, password: string) {
  console.log("🔐 SSO Login attempt:", email);

  // Tìm user trong Firestore
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("email", "==", email));
  const querySnapshot = await getDocs(q);

  // Nếu không tìm thấy user
  if (querySnapshot.empty) {
    throw new Error("Email hoặc mật khẩu không đúng");
  }

  const userDoc = querySnapshot.docs[0];
  const userData = userDoc.data();

  // Kiểm tra mật khẩu
  if (userData.password !== password) {
    throw new Error("Email hoặc mật khẩu không đúng");
  }

  // Kiểm tra tài khoản đã được duyệt chưa
  if (userData.role !== "admin" && userData.approved === false) {
    throw new Error("Tài khoản của bạn chưa được duyệt");
  }

  // Lưu vào localStorage
  localStorage.setItem("currentUser", JSON.stringify(userData));
  
  // Reload để cập nhật UI
  window.location.reload();
}

// Hàm đăng xuất
async function handleLogout() {
  console.log("🚪 SSO Logout");
  localStorage.removeItem("currentUser");
  window.location.href = "/";
}

// Khởi tạo listener
if (typeof window !== "undefined") {
  initSSOListener({
    onLogin: handleLogin,
    onLogout: handleLogout,
  });
  console.log("🔗 SSO Listener initialized for UP Care");
}
