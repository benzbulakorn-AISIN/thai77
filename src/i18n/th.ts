export const th = {
  appName: 'เที่ยวไทย 77',
  slogan: 'เที่ยวให้ครบ 77 จังหวัด',
  nav: {
    home: 'หน้าแรก', explore: 'สำรวจ', trips: 'ทริป', memories: 'ความทรงจำ', profile: 'โปรไฟล์', search: 'ค้นหา',
    main: 'เมนูหลัก', side: 'เมนูข้าง', collapse: 'พับเมนู', expand: 'ขยายเมนู',
  },
  common: { loading: 'กำลังโหลด…', retry: 'ลองใหม่', save: 'บันทึก', cancel: 'ยกเลิก', offline: 'ออฟไลน์อยู่ ข้อมูลอาจไม่อัปเดต' },
  auth: {
    login: 'เข้าสู่ระบบ', logout: 'ออกจากระบบ', email: 'อีเมล', password: 'รหัสผ่าน',
    forgot: 'ลืมรหัสผ่าน', sendReset: 'ส่งลิงก์ตั้งรหัสใหม่', guest: 'ใช้แบบผู้เยี่ยมชม',
    resetSent: 'ส่งลิงก์ไปที่อีเมลแล้ว', loginFailed: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    newPassword: 'รหัสผ่านใหม่', setPassword: 'ตั้งรหัสผ่านใหม่', passwordUpdated: 'เปลี่ยนรหัสผ่านแล้ว',
  },
} as const;
export const t = th; // เตรียมไว้สำหรับหลายภาษาในอนาคต (ตอนนี้ใช้ภาษาไทยอย่างเดียว)
