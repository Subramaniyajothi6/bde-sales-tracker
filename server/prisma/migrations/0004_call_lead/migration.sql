-- AlterTable
ALTER TABLE `CallLog` ADD COLUMN `leadId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `CallLog_leadId_idx` ON `CallLog`(`leadId`);

-- AddForeignKey
ALTER TABLE `CallLog` ADD CONSTRAINT `CallLog_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

