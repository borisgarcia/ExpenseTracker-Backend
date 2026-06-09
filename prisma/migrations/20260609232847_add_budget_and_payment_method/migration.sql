-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'Cash';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "monthlyBudget" DOUBLE PRECISION NOT NULL DEFAULT 1500;
