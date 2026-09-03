import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatOMR, formatDate } from '../api/client';
import type { Employee, EmployeePersonalDetails } from '../types/index';

export interface EmployeeSummaryPdfData {
  employee: Employee;
  personalDetails?: EmployeePersonalDetails | null;
  complianceData?: any;
  summaryStats?: {
    totalSalaryDrawn?: number;
    outstandingSalary?: number;
    outstandingLoan?: number;
    totalLoanTaken?: number;
    totalLoanRecovered?: number;
  };
  currentProject?: string;
}

function calculateAge(dobString?: string): number | null {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

export function generateEmployeeSummaryPdf(data: EmployeeSummaryPdfData): jsPDF {
  const { employee, personalDetails, complianceData, summaryStats, currentProject } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm

  // Colors
  const primaryBlue = [24, 63, 133]; // #183f85
  const slateDark = [30, 41, 59]; // #1e293b
  const slateMuted = [100, 116, 139]; // #64748b
  const bgLight = [248, 250, 252]; // #f8fafc
  const accentEmerald = [16, 149, 106]; // #10b981
  const borderSlate = [226, 232, 240];

  // 1. TOP HEADER BANNER
  doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Top Header Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('ARTIFY GROUP • EMPLOYEE SUMMARY DOSSIER', margin, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('CONFIDENTIAL • HUMAN RESOURCES & STATUTORY RECORD', margin, 15);

  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  doc.text(`Generated: ${printDate} | Form Ref: HR-EMP-${employee.employeeId}`, pageWidth - margin, 10, { align: 'right' });
  doc.text(`Status: ${employee.isActive ? 'ACTIVE EMPLOYEE' : 'INACTIVE'}`, pageWidth - margin, 15, { align: 'right' });

  // 2. EMPLOYEE HERO IDENTITY CARD (Y: 26 to 52)
  const heroY = 25;
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderSlate[0], borderSlate[1], borderSlate[2]);
  doc.roundedRect(margin, heroY, contentWidth, 26, 2, 2, 'FD');

  // Avatar / Photo Box
  const avatarSize = 20;
  const avatarX = margin + 3;
  const avatarY = heroY + 3;
  doc.setFillColor(235, 240, 250);
  doc.setDrawColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.roundedRect(avatarX, avatarY, avatarSize, avatarSize, 1.5, 1.5, 'FD');

  // Initials inside avatar box
  const initials = (employee.employeeName || 'EMP')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
  doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(initials, avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 4, { align: 'center' });

  // Hero Info Details
  const infoX = avatarX + avatarSize + 5;
  doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(employee.employeeName || '—', infoX, heroY + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
  doc.text(`ID: ${employee.employeeId}`, infoX, heroY + 13.5);

  const empAny = employee as any;
  const assignedProject = currentProject || empAny.currentProject || empAny.project || 'Headquarters';
  const basicSalary = empAny.basicSalary ?? employee.monthlySalaryOrRate ?? 0;
  const grossSalary = empAny.grossSalary ?? employee.actualSalary ?? employee.monthlySalaryOrRate ?? 0;
  const bankName = empAny.bankName || empAny.bank || '—';
  const accountNumber = empAny.accountNumber || empAny.accountNo || empAny.iban || '—';

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
  doc.text(`Designation: ${employee.designation || 'General Staff'} • Company: ${employee.employeeCompany || 'Artify Group'}`, infoX, heroY + 18.5);
  doc.text(`Nationality: ${employee.nationalityType || '—'} • Type: ${employee.employeeType || 'Direct'} • Worksite: ${assignedProject}`, infoX, heroY + 23);

  // Status Badge on Right of Hero
  doc.setFillColor(employee.isActive ? accentEmerald[0] : 148, employee.isActive ? accentEmerald[1] : 163, employee.isActive ? accentEmerald[2] : 184);
  doc.roundedRect(pageWidth - margin - 32, heroY + 5, 29, 6, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(employee.isActive ? 'ACTIVE' : 'INACTIVE', pageWidth - margin - 17.5, heroY + 9.2, { align: 'center' });

  // 3. KEY FINANCIAL & OPERATIONAL STATS BAR (Y: 53 to 71)
  const statsY = 53;
  const statBoxWidth = (contentWidth - 8) / 5;
  const statHeight = 16;

  const personal = complianceData?.personalDetails || personalDetails || {};
  const dob = personal?.dateOfBirth || personal?.dob;
  const age = calculateAge(dob);

  const stats = [
    { label: 'BASIC SALARY', value: `OMR ${formatOMR(basicSalary)}` },
    { label: 'GROSS SALARY', value: `OMR ${formatOMR(grossSalary)}` },
    { label: 'SALARY DRAWN', value: `OMR ${formatOMR(summaryStats?.totalSalaryDrawn || 0)}` },
    { label: 'OUTSTANDING SALARY', value: `OMR ${formatOMR(summaryStats?.outstandingSalary || 0)}` },
    { label: 'OUTSTANDING LOAN', value: `OMR ${formatOMR(summaryStats?.outstandingLoan || 0)}` },
  ];

  stats.forEach((st, idx) => {
    const boxX = margin + idx * (statBoxWidth + 2);
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(borderSlate[0], borderSlate[1], borderSlate[2]);
    doc.roundedRect(boxX, statsY, statBoxWidth, statHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(slateMuted[0], slateMuted[1], slateMuted[2]);
    doc.text(st.label, boxX + statBoxWidth / 2, statsY + 5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text(st.value, boxX + statBoxWidth / 2, statsY + 11.5, { align: 'center' });
  });

  // 4. DATA SECTIONS USING AUTOTABLE (Y: 72+)
  let currentY = 72;

  // Section 1: Personal & Demographic Information
  const primaryEmergency = Array.isArray(personal?.emergencyContacts) && personal.emergencyContacts.length > 0
    ? personal.emergencyContacts.find((c: any) => c.isPrimary) || personal.emergencyContacts[0]
    : null;
  const emergencyStr = primaryEmergency?.name
    ? `${primaryEmergency.name} (${primaryEmergency.relationship || 'Contact'}) • ${primaryEmergency.contactNumber || ''}`
    : personal?.emergencyContactName
    ? `${personal.emergencyContactName} • ${personal.emergencyContactPhone || ''}`
    : '—';

  const mobile = personal?.mobileNumber || personal?.whatsappNumber || personal?.mobile || '—';
  const email = personal?.personalEmail || personal?.email || '—';
  const address = personal?.residentialAddress || personal?.currentAddress || '—';

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['1. PERSONAL & DEMOGRAPHIC PROFILE', '']],
    body: [
      ['Father\'s Name', personal?.fatherName || '—'],
      ['Date of Birth / Age', `${dob ? formatDate(dob) : '—'} ${age !== null ? `(${age} years old)` : ''}`],
      ['Gender & Marital Status', `${personal?.gender || 'Male'} • ${personal?.maritalStatus || 'Single'}`],
      ['Blood Group', personal?.bloodGroup || '—'],
      ['Mobile Phone & WhatsApp', mobile],
      ['Personal Email', email],
      ['Residential Address', address],
      ['Emergency Contact', emergencyStr],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: primaryBlue as [number, number, number],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 1.5,
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 1.4,
      textColor: slateDark as [number, number, number],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50, fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 3.5;

  // Section 2: Employment & Payroll Configuration
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['2. EMPLOYMENT & PAYROLL CONFIGURATION', '']],
    body: [
      ['Employment Status & Type', `${employee.isActive ? 'Active' : 'Inactive'} • ${employee.employeeType || 'Direct'}`],
      ['Joining Date & Tenure', employee.dateOfJoining ? formatDate(employee.dateOfJoining) : '—'],
      ['Company & Project Worksite', `${employee.employeeCompany || '—'} • ${assignedProject}`],
      ['Salary Paid By & Wage Type', `${employee.salaryPaidBy || '—'} • ${employee.wageType || 'Monthly'}`],
      ['WPS Status', employee.wpsEmployee === 'Yes' ? 'WPS Registered (CBO Compliant)' : 'Non-WPS'],
      ['Bank & Account / IBAN', `${bankName} • Account: ${accountNumber}`],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: primaryBlue as [number, number, number],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 1.5,
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 1.4,
      textColor: slateDark as [number, number, number],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50, fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 3.5;

  // Section 3: Statutory Identification & Document Compliance
  const civilIdNumber = complianceData?.currentCivilId?.civilIdNumber || personal?.civilIdNumber || '—';
  const civilIdExpiry = complianceData?.currentCivilId?.expiryDate ? formatDate(complianceData.currentCivilId.expiryDate) : '—';
  const civilIdStatus = complianceData?.currentCivilId?.status || 'Valid';

  const passportDoc = (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Passport');
  const passportNumber = passportDoc?.documentNumber || personal?.passportNumber || '—';
  const passportExpiry = passportDoc?.expiryDate ? formatDate(passportDoc.expiryDate) : '—';
  const passportStatus = passportDoc?.status || 'Valid';

  const visaDoc = complianceData?.currentVisa || (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Visa');
  const visaNumber = visaDoc?.visaNumber || visaDoc?.documentNumber || personal?.visaNumber || '—';
  const visaExpiry = visaDoc?.expiryDate ? formatDate(visaDoc.expiryDate) : '—';
  const visaStatus = visaDoc?.status || 'Valid';

  const dlDoc = complianceData?.currentDrivingLicence || (complianceData?.governmentDocuments || []).find((d: any) => d.documentType === 'Driving Licence');
  const dlNumber = dlDoc?.licenceNumber || dlDoc?.documentNumber || personal?.drivingLicenceNumber || '—';
  const dlExpiry = dlDoc?.expiryDate ? formatDate(dlDoc.expiryDate) : '—';

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['3. STATUTORY IDENTIFICATION & EXPIRY STATUS', '']],
    body: [
      ['Civil ID / National Card', `${civilIdNumber} (Expiry: ${civilIdExpiry}) [Status: ${civilIdStatus}]`],
      ['Passport & Country', `${passportNumber} (Expiry: ${passportExpiry}) [Status: ${passportStatus}]`],
      ['Employment Visa / Work Permit', `${visaNumber} (Expiry: ${visaExpiry}) [Status: ${visaStatus}]`],
      ['Driving Licence', dlNumber !== '—' ? `${dlNumber} (Expiry: ${dlExpiry})` : 'Not Applicable / Not Recorded'],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: primaryBlue as [number, number, number],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: 1.5,
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 1.4,
      textColor: slateDark as [number, number, number],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50, fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // 5. OFFICIAL SIGN-OFF AND VERIFICATION BOXES (Bottom of Page)
  const footerBoxY = currentY;
  const boxW = (contentWidth - 6) / 2;
  const boxH = 22;

  // Left: HR Verification
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(borderSlate[0], borderSlate[1], borderSlate[2]);
  doc.roundedRect(margin, footerBoxY, boxW, boxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
  doc.text('PREPARED & VERIFIED BY (HR DEPARTMENT):', margin + 3, footerBoxY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(slateMuted[0], slateMuted[1], slateMuted[2]);
  doc.text('Signature & Official Stamp: ________________________', margin + 3, footerBoxY + 12);
  doc.text('Date: ________________________', margin + 3, footerBoxY + 18);

  // Right: Employee Acknowledgment
  doc.setFillColor(250, 250, 252);
  doc.setDrawColor(borderSlate[0], borderSlate[1], borderSlate[2]);
  doc.roundedRect(margin + boxW + 6, footerBoxY, boxW, boxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(slateDark[0], slateDark[1], slateDark[2]);
  doc.text('EMPLOYEE ACKNOWLEDGMENT:', margin + boxW + 9, footerBoxY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(slateMuted[0], slateMuted[1], slateMuted[2]);
  doc.text('Signature: ________________________', margin + boxW + 9, footerBoxY + 12);
  doc.text('Date: ________________________', margin + boxW + 9, footerBoxY + 18);

  // Bottom Notice
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5.5);
  doc.setTextColor(slateMuted[0], slateMuted[1], slateMuted[2]);
  doc.text(
    'This document is a certified digital extract generated from the central enterprise payroll & personnel database. Page 1 of 1',
    pageWidth / 2,
    290,
    { align: 'center' }
  );

  return doc;
}
