const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Employee = require('../models/Employee');
const { auth, restrictTo } = require('../middleware/auth');
const { logAction } = require('../utils/logger');
const router = express.Router();

router.use((req, res, next) => {
  console.log(`[EMPLOYEES] Route request received: ${req.method} ${req.baseUrl}${req.path}`);
  next();
});

// Multer Storage Configuration for Resume uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Admin restriction applies to all endpoints here
router.use(auth, restrictTo('Admin'));

// 1. Get all employees (with self-healing unique employeeId backfill)
router.get('/', async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });
    let updated = false;
    for (let emp of employees) {
      if (!emp.employeeId) {
        const lastEmp = await Employee.findOne(
          { _id: { $ne: emp._id }, employeeId: { $regex: '^EMP-\\d+$' } },
          { employeeId: 1 },
          { sort: { createdAt: -1 } }
        );
        let nextNum = 1001;
        if (lastEmp && lastEmp.employeeId) {
          const match = lastEmp.employeeId.match(/EMP-(\d+)/);
          if (match) {
            nextNum = parseInt(match[1], 10) + 1;
          }
        }
        let isUnique = false;
        while (!isUnique) {
          const existing = await Employee.findOne({ employeeId: `EMP-${nextNum}` });
          if (!existing) {
            isUnique = true;
          } else {
            nextNum++;
          }
        }
        emp.employeeId = `EMP-${nextNum}`;
        await emp.save();
        updated = true;
      }
    }
    const finalEmployees = updated ? await Employee.find().sort({ createdAt: -1 }) : employees;
    res.send(finalEmployees);
  } catch (error) {
    console.error('Fetch employees error:', error);
    res.status(500).send({ error: 'Failed to fetch employees.' });
  }
});

// 2. Add Employee
router.post('/', upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'aadharDoc', maxCount: 1 },
  { name: 'photoDoc', maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, email, phone, dateOfJoining, basicDetails, aadharNumber, department, role, address, panNumber, dateOfBirth, designation } = req.body;
    
    const resumeUrl = req.files && req.files['resume'] ? `/uploads/${req.files['resume'][0].filename}` : '';
    const aadharDocUrl = req.files && req.files['aadharDoc'] ? `/uploads/${req.files['aadharDoc'][0].filename}` : '';
    const photoUrl = req.files && req.files['photoDoc'] ? `/uploads/${req.files['photoDoc'][0].filename}` : '';

    const employee = new Employee({
      name,
      email,
      phone,
      dateOfJoining,
      basicDetails,
      aadharNumber,
      resumeUrl,
      department,
      role,
      address,
      panNumber,
      dateOfBirth: dateOfBirth || null,
      designation,
      aadharDocUrl,
      photoUrl
    });

    await employee.save();
    await logAction(req.user, 'EMPLOYEE_CREATE', `Created employee profile for ${name}`, req);
    res.status(201).send(employee);
  } catch (error) {
    res.status(400).send({ error: 'Failed to add employee: ' + error.message });
  }
});

// 3. Update Employee Details
router.put('/:id', upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'aadharDoc', maxCount: 1 },
  { name: 'photoDoc', maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, email, phone, dateOfJoining, basicDetails, aadharNumber, status, department, role, address, panNumber, dateOfBirth, designation } = req.body;
    
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).send({ error: 'Employee not found.' });

    // Self-healing check for legacy record updates
    if (!employee.employeeId) {
      const lastEmp = await Employee.findOne(
        { _id: { $ne: employee._id }, employeeId: { $regex: '^EMP-\\d+$' } },
        { employeeId: 1 },
        { sort: { createdAt: -1 } }
      );
      let nextNum = 1001;
      if (lastEmp && lastEmp.employeeId) {
        const match = lastEmp.employeeId.match(/EMP-(\d+)/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }
      let isUnique = false;
      while (!isUnique) {
        const existing = await Employee.findOne({ employeeId: `EMP-${nextNum}` });
        if (!existing) {
          isUnique = true;
        } else {
          nextNum++;
        }
      }
      employee.employeeId = `EMP-${nextNum}`;
    }

    if (name) employee.name = name;
    if (email !== undefined) employee.email = email || '';
    if (phone) employee.phone = phone;
    if (dateOfJoining) employee.dateOfJoining = dateOfJoining;
    if (basicDetails) employee.basicDetails = basicDetails;
    if (aadharNumber) employee.aadharNumber = aadharNumber;
    if (status) employee.status = status;
    if (department !== undefined) employee.department = department;
    if (role !== undefined) employee.role = role;
    if (address !== undefined) employee.address = address;
    if (panNumber !== undefined) employee.panNumber = panNumber;
    if (dateOfBirth !== undefined) employee.dateOfBirth = dateOfBirth || null;
    if (designation !== undefined) employee.designation = designation;

    if (req.files) {
      if (req.files['resume']) {
        if (employee.resumeUrl) {
          const oldPath = path.join(__dirname, '..', employee.resumeUrl);
          if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (e) {} }
        }
        employee.resumeUrl = `/uploads/${req.files['resume'][0].filename}`;
      }
      if (req.files['aadharDoc']) {
        if (employee.aadharDocUrl) {
          const oldPath = path.join(__dirname, '..', employee.aadharDocUrl);
          if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (e) {} }
        }
        employee.aadharDocUrl = `/uploads/${req.files['aadharDoc'][0].filename}`;
      }
      if (req.files['photoDoc']) {
        if (employee.photoUrl) {
          const oldPath = path.join(__dirname, '..', employee.photoUrl);
          if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (e) {} }
        }
        employee.photoUrl = `/uploads/${req.files['photoDoc'][0].filename}`;
      }
    }

    await employee.save();
    await logAction(req.user, 'EMPLOYEE_UPDATE', `Updated employee profile for ${employee.name}`, req);
    res.send(employee);
  } catch (error) {
    res.status(400).send({ error: 'Failed to update employee: ' + error.message });
  }
});

// Save bulk attendance
router.post('/attendance/bulk', async (req, res) => {
  try {
    const { date, records } = req.body;
    if (!date || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Date and records array are required.' });
    }

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const updatedEmployees = [];
    for (const record of records) {
      const { employeeId, status, remarks } = record;
      const employee = await Employee.findById(employeeId);
      if (employee) {
        employee.attendance = employee.attendance.filter(a => {
          const d = new Date(a.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() !== attendanceDate.getTime();
        });
        let saveStatus = status;
        let isWeeklyOff = false;
        if (status === 'Weekly Off') {
          saveStatus = 'Present';
          isWeeklyOff = true;
        }

        employee.attendance.push({
          date: attendanceDate,
          status: saveStatus,
          isWeeklyOff,
          updatedBy: req.user ? req.user.name : 'System',
          updatedTime: new Date(),
          remarks: remarks || ''
        });
        await employee.save();
        updatedEmployees.push(employee);
      }
    }
    
    await logAction(req.user, 'EMPLOYEE_ATTENDANCE_BULK', `Updated attendance for ${updatedEmployees.length} employees`, req);
    res.json({ success: true, count: updatedEmployees.length });
  } catch (error) {
    console.error('[EMPLOYEES] Bulk attendance save error:', error);
    res.status(400).json({ error: 'Failed to save attendance: ' + error.message });
  }
});

// 4. Save daily attendance
router.post('/:id/attendance', async (req, res) => {
  try {
    const { date, status, remarks } = req.body;
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).send({ error: 'Employee not found.' });

    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    // Remove existing record for the same day if present
    employee.attendance = employee.attendance.filter(a => {
      const d = new Date(a.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() !== attendanceDate.getTime();
    });

    let saveStatus = status;
    let isWeeklyOff = false;
    if (status === 'Weekly Off') {
      saveStatus = 'Present';
      isWeeklyOff = true;
    }

    employee.attendance.push({
      date: attendanceDate,
      status: saveStatus,
      isWeeklyOff,
      updatedBy: req.user ? req.user.name : 'System',
      updatedTime: new Date(),
      remarks: remarks || ''
    });
    await employee.save();
    
    res.send(employee);
  } catch (error) {
    res.status(400).send({ error: 'Failed to save attendance: ' + error.message });
  }
});

// 5. Generate monthly salary statement
router.post('/:id/salary', async (req, res) => {
  try {
    const { monthYear, basicSalary, advances, deductions, specialAllowance, otherAllowance, otherAllowanceDescription, deductionsDescription } = req.body;
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).send({ error: 'Employee not found.' });

    // Count leaves for the specified month-year (formatted YYYY-MM) with default Sundays as Weekly Off
    const [year, month] = monthYear.split('-').map(Number);
    const endDate = new Date(year, month, 0); // last day of month
    
    let absentCount = 0;
    let halfDayCount = 0;
    let leaveCount = 0;
    let presentCount = 0;
    let weeklyOffCount = 0;
    
    const attendanceMap = {};
    employee.attendance.forEach(a => {
      const d = new Date(a.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      attendanceMap[`${yyyy}-${mm}-${dd}`] = a.isWeeklyOff ? 'Weekly Off' : a.status;
    });

    for (let day = 1; day <= endDate.getDate(); day++) {
      const currentDate = new Date(year, month - 1, day);
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      
      const status = attendanceMap[key];
      if (status) {
        if (status === 'Absent') {
          absentCount += 1;
        } else if (status === 'Half Day') {
          halfDayCount += 1;
        } else if (status === 'Leave') {
          leaveCount += 1;
        } else if (status === 'Present' || status === 'Present (Worked on Weekly Off)') {
          presentCount += 1;
        } else if (status === 'Weekly Off') {
          weeklyOffCount += 1;
        }
      } else {
        if (currentDate.getDay() === 0) {
          weeklyOffCount += 1; // Default Sunday to Weekly Off
        }
      }
    }
    
    // Calculate service duration in months from employee's dateOfJoining to target monthYear
    const doj = new Date(employee.dateOfJoining || Date.now());
    const targetDate = new Date(year, month - 1, 1);
    const diffYears = targetDate.getFullYear() - doj.getFullYear();
    const diffMonths = targetDate.getMonth() - doj.getMonth() + (diffYears * 12);
    const exemptedLeavesAllowed = diffMonths >= 6 ? 2 : 1;

    // Deduct salary only for actual Absent days, Leave days, and 0.5 * Half Days, minus exempted leaves.
    const leavesCount = absentCount + leaveCount + 0.5 * halfDayCount;
    const excessLeaves = Math.max(0, leavesCount - exemptedLeavesAllowed);

    const special = Number(specialAllowance) || 0;
    const other = Number(otherAllowance) || 0;
    const basic = Number(basicSalary) || 0;
    const adv = Number(advances) || 0;
    const extraDeduct = Number(deductions) || 0;

    // Deduct salary per day of excessLeaves (assumes 30 days month)
    const leaveDeduction = (basic / 30) * excessLeaves;
    const netSalary = Math.round(Math.max(0, basic + special + other - adv - extraDeduct - leaveDeduction));

    // Remove existing slip for the month if exists
    employee.salaries = employee.salaries.filter(s => s.monthYear !== monthYear);

    employee.salaries.push({
      monthYear,
      basicSalary: basic,
      leaves: leavesCount,
      advances: adv,
      deductions: extraDeduct,
      deductionsDescription: deductionsDescription || '',
      specialAllowance: special,
      otherAllowance: other,
      otherAllowanceDescription,
      netSalary
    });

    await employee.save();
    await logAction(req.user, 'EMPLOYEE_SALARY_GEN', `Generated salary slip for ${employee.name} - ${monthYear}`, req);
    res.send(employee);
  } catch (error) {
    res.status(400).send({ error: 'Failed to generate salary slip: ' + error.message });
  }
});

// 6. Delete Employee Profile
router.delete('/:id', async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).send({ error: 'Employee not found.' });

    // Delete files from storage
    const filesToDelete = [employee.resumeUrl, employee.aadharDocUrl, employee.photoUrl];
    for (const fileUrl of filesToDelete) {
      if (fileUrl) {
        const oldPath = path.join(__dirname, '..', fileUrl);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (e) {
            console.error('Failed to delete file:', e);
          }
        }
      }
    }

    await logAction(req.user, 'EMPLOYEE_DELETE', `Deleted employee profile for ${employee.name}`, req);
    res.send({ message: 'Employee deleted successfully.' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to delete employee: ' + error.message });
  }
});

module.exports = router;
