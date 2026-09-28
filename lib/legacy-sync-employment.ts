import { collection, getDocs, query, where, updateDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { EmploymentInfo } from '@/types/user';

const EMPLOYEE_API = 'https://checkin-ten-gamma.vercel.app/api/employees';

// Đồng bộ thông tin employment từ hệ thống chấm công/nhân sự sang collection "users"
// LƯU Ý: Chỉ chạm vào các field bổ sung, không sửa các field core (uid, role, password, approved, ...)
export async function syncEmploymentToUsers() {
  const res = await fetch(EMPLOYEE_API);
  if (!res.ok) {
    throw new Error('Không gọi được Employee API');
  }

  const employees: EmploymentInfo[] = await res.json();

  for (const emp of employees) {
    if (!emp.email) continue;

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', emp.email));
    const snap = await getDocs(q);

    if (snap.empty) {
      // Không tìm thấy user tương ứng email này -> tạo mới user staff
      const newUserId = `staff_${emp.id || Date.now()}`;

      const newUser: Record<string, unknown> = {
        uid: newUserId,
        email: emp.email,
        // Lấy mật khẩu từ hệ thống nhân sự, nếu không có thì để trống
        password: emp.password || '',
        displayName: emp.fullName || emp.email,
        role: 'staff',
        approved: true, // Cho phép hiển thị luôn trong danh sách
        totalLearningHours: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        employment: emp,
      };

      // Map các field về profile để dễ dùng trong LMS
      if (emp.phone) newUser.phoneNumber = emp.phone;
      if (emp.address) newUser.address = emp.address;
      if (emp.country) newUser.country = emp.country;
      if (emp.avatarURL) newUser.photoURL = emp.avatarURL;
      if (emp.birthday) newUser.dateOfBirth = emp.birthday;
      if (emp.department) newUser.employmentDepartment = emp.department;
      if (emp.position) newUser.position = emp.position;
      if (typeof emp.baseSalary === 'number') newUser.monthlySalary = emp.baseSalary;
      if (emp.employmentStatus) newUser.employmentStatus = emp.employmentStatus;
      if (emp.startDate) newUser.employmentStartDate = emp.startDate;
      if (emp.maritalStatus) newUser.employmentMaritalStatus = emp.maritalStatus;
      if (emp.branch) newUser.employmentBranch = emp.branch;
      if (emp.team) newUser.employmentTeam = emp.team;
      if (typeof emp.salaryPercentage === 'number') newUser.employmentSalaryPercentage = emp.salaryPercentage;
      if (typeof emp.active === 'boolean') newUser.employmentActive = emp.active;

      await setDoc(doc(db, 'users', newUserId), newUser);
    } else {
      // Nếu có nhiều document trùng email, lấy document đầu tiên
      const userDoc = snap.docs[0];
      const currentData = userDoc.data();

      // Chuẩn bị object update nhưng KHÔNG đưa các field undefined vào Firestore
      const updateData: Record<string, unknown> = {
        // lưu nguyên object employment để có đầy đủ dữ liệu HR
        employment: emp,
        updatedAt: new Date(),
      };

      // Cập nhật mật khẩu nếu có từ hệ thống nhân sự
      if (emp.password) {
        updateData.password = emp.password;
      }

      // Cập nhật ngày sinh nếu có
      const dateOfBirth = emp.birthday ?? currentData.dateOfBirth;
      if (dateOfBirth !== undefined) {
        updateData.dateOfBirth = dateOfBirth;
      }

      // Cập nhật phòng ban từ hệ thống nhân sự
      const employmentDepartment = emp.department ?? currentData.employmentDepartment;
      if (employmentDepartment !== undefined) {
        updateData.employmentDepartment = employmentDepartment;
      }

      // Cập nhật chức vụ nếu có
      const position = emp.position ?? currentData.position;
      if (position !== undefined) {
        updateData.position = position;
      }

      const phoneNumber = emp.phone ?? currentData.phoneNumber;
      if (phoneNumber !== undefined) {
        updateData.phoneNumber = phoneNumber;
      }

      const address = emp.address ?? currentData.address;
      if (address !== undefined) {
        updateData.address = address;
      }

      const country = emp.country ?? currentData.country;
      if (country !== undefined) {
        updateData.country = country;
      }

      const photoURL = emp.avatarURL ?? currentData.photoURL;
      if (photoURL !== undefined) {
        updateData.photoURL = photoURL;
      }

      const monthlySalary = emp.baseSalary ?? currentData.monthlySalary;
      if (monthlySalary !== undefined) {
        updateData.monthlySalary = monthlySalary;
      }

      const employmentStatus = emp.employmentStatus ?? currentData.employmentStatus;
      if (employmentStatus !== undefined) {
        updateData.employmentStatus = employmentStatus;
      }

      const employmentStartDate = emp.startDate ?? currentData.employmentStartDate;
      if (employmentStartDate !== undefined) {
        updateData.employmentStartDate = employmentStartDate;
      }

      const employmentMaritalStatus = emp.maritalStatus ?? currentData.employmentMaritalStatus;
      if (employmentMaritalStatus !== undefined) {
        updateData.employmentMaritalStatus = employmentMaritalStatus;
      }

      const employmentBranch = emp.branch ?? currentData.employmentBranch;
      if (employmentBranch !== undefined) {
        updateData.employmentBranch = employmentBranch;
      }

      const employmentTeam = emp.team ?? currentData.employmentTeam;
      if (employmentTeam !== undefined) {
        updateData.employmentTeam = employmentTeam;
      }

      const employmentSalaryPercentage = emp.salaryPercentage ?? currentData.employmentSalaryPercentage;
      if (employmentSalaryPercentage !== undefined) {
        updateData.employmentSalaryPercentage = employmentSalaryPercentage;
      }

      const employmentActive = emp.active ?? currentData.employmentActive;
      if (employmentActive !== undefined) {
        updateData.employmentActive = employmentActive;
      }

      await updateDoc(userDoc.ref, updateData);
    }
  }
}
