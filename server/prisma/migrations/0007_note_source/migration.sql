-- AlterTable
ALTER TABLE `LeadNote` ADD COLUMN `source` ENUM('PAGE', 'CALL', 'SHEET', 'IMPORT') NOT NULL DEFAULT 'PAGE';

-- Label the history written before this column existed
UPDATE `LeadNote` SET `source` = 'IMPORT' WHERE `text` LIKE 'Imported from %';
UPDATE `LeadNote` SET `source` = 'CALL' WHERE `text` LIKE 'Called: %' OR `text` LIKE 'Call undone (%';
UPDATE `LeadNote` SET `source` = 'SHEET' WHERE `text` IN ('Updated from a sheet', 'Lead added from a sheet');
-- Lines saved together with those (same lead, within 2 seconds) came from the same place
UPDATE `LeadNote` n
  JOIN (SELECT `leadId`, `createdAt`, `source` FROM `LeadNote` WHERE `source` IN ('CALL', 'SHEET')) m
    ON m.`leadId` = n.`leadId` AND ABS(TIMESTAMPDIFF(MICROSECOND, m.`createdAt`, n.`createdAt`)) < 2000000
  SET n.`source` = m.`source`
  WHERE n.`source` = 'PAGE';
-- The marker line is no longer needed: the source says it
DELETE FROM `LeadNote` WHERE `text` = 'Updated from a sheet';
