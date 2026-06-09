-- Insert default system categories safely if they do not exist yet
INSERT INTO "Category" ("id", "name", "userId", "createdAt", "updatedAt") 
SELECT '550e8400-e29b-41d4-a716-446655440000', 'Food', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Food' AND "userId" IS NULL);

INSERT INTO "Category" ("id", "name", "userId", "createdAt", "updatedAt") 
SELECT '550e8400-e29b-41d4-a716-446655440001', 'Transport', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Transport' AND "userId" IS NULL);

INSERT INTO "Category" ("id", "name", "userId", "createdAt", "updatedAt") 
SELECT '550e8400-e29b-41d4-a716-446655440002', 'Utilities', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Utilities' AND "userId" IS NULL);

INSERT INTO "Category" ("id", "name", "userId", "createdAt", "updatedAt") 
SELECT '550e8400-e29b-41d4-a716-446655440003', 'Entertainment', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Entertainment' AND "userId" IS NULL);

INSERT INTO "Category" ("id", "name", "userId", "createdAt", "updatedAt") 
SELECT '550e8400-e29b-41d4-a716-446655440004', 'Housing', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Housing' AND "userId" IS NULL);

INSERT INTO "Category" ("id", "name", "userId", "createdAt", "updatedAt") 
SELECT '550e8400-e29b-41d4-a716-446655440005', 'Health', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Health' AND "userId" IS NULL);

INSERT INTO "Category" ("id", "name", "userId", "createdAt", "updatedAt") 
SELECT '550e8400-e29b-41d4-a716-446655440006', 'Other', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE "name" = 'Other' AND "userId" IS NULL);