-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(150) NULL,
    `role` ENUM('ADMIN', 'BDE') NOT NULL DEFAULT 'BDE',
    `passwordHash` VARCHAR(100) NOT NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT true,
    `tokenVersion` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `dailyTarget` INTEGER NOT NULL DEFAULT 80,
    `joinedOn` DATE NOT NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_employeeId_key`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Course` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(120) NOT NULL,
    `type` ENUM('COURSE', 'INTERNSHIP') NOT NULL,
    `fee` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(10) NOT NULL,
    `courseId` INTEGER NOT NULL,
    `ownerId` INTEGER NOT NULL,
    `stage` ENUM('INTERESTED', 'FOLLOW_UP', 'INTERVIEW_SCHEDULED', 'SELECTED', 'PAYMENT_COMMITTED', 'PAID', 'NOT_INTERESTED') NOT NULL DEFAULT 'INTERESTED',
    `followUpOn` DATE NULL,
    `nextAction` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Lead_phone_key`(`phone`),
    INDEX `Lead_ownerId_stage_idx`(`ownerId`, `stage`),
    INDEX `Lead_followUpOn_idx`(`followUpOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadNote` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leadId` INTEGER NOT NULL,
    `authorId` INTEGER NOT NULL,
    `text` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LeadNote_leadId_idx`(`leadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CallLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bdeId` INTEGER NOT NULL,
    `outcome` ENUM('INTERESTED', 'CALL_BACK', 'NOT_INTERESTED', 'NO_ANSWER') NOT NULL,
    `calledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `workDate` DATE NOT NULL,

    INDEX `CallLog_bdeId_workDate_idx`(`bdeId`, `workDate`),
    INDEX `CallLog_workDate_idx`(`workDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bdeId` INTEGER NOT NULL,
    `workDate` DATE NOT NULL,
    `submittedAt` DATETIME(3) NULL,

    UNIQUE INDEX `DailyReport_bdeId_workDate_key`(`bdeId`, `workDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Interview` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leadId` INTEGER NOT NULL,
    `createdById` INTEGER NOT NULL,
    `scheduledAt` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'ATTENDED', 'NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
    `result` ENUM('SELECTED', 'NOT_SELECTED') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Interview_scheduledAt_idx`(`scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leadId` INTEGER NOT NULL,
    `recordedById` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` ENUM('PROMISED', 'PARTIALLY_PAID', 'PAID') NOT NULL,
    `date` DATE NOT NULL,
    `note` VARCHAR(300) NULL,
    `receiptKey` VARCHAR(200) NULL,
    `receiptName` VARCHAR(200) NULL,
    `receiptType` VARCHAR(80) NULL,
    `check` ENUM('TO_VERIFY', 'VERIFIED', 'REJECTED') NULL,
    `rejectReason` VARCHAR(200) NULL,
    `verifiedById` INTEGER NULL,
    `verifiedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Payment_leadId_idx`(`leadId`),
    INDEX `Payment_date_idx`(`date`),
    INDEX `Payment_check_idx`(`check`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadNote` ADD CONSTRAINT `LeadNote_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadNote` ADD CONSTRAINT `LeadNote_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_bdeId_fkey` FOREIGN KEY (`bdeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyReport` ADD CONSTRAINT `DailyReport_bdeId_fkey` FOREIGN KEY (`bdeId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_recordedById_fkey` FOREIGN KEY (`recordedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_verifiedById_fkey` FOREIGN KEY (`verifiedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

