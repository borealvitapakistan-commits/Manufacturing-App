import { Route, Routes } from 'react-router-dom'

import { ToastProvider } from '@/components/ui'
import HomePage from '@/pages/HomePage'
import BrandsPage from '@/pages/BrandsPage'
import ProductsPage from '@/pages/ProductsPage'
import RawMaterialsPage from '@/pages/RawMaterialsPage'
import LabelsPage from '@/pages/LabelsPage'
import VendorsPage from '@/pages/VendorsPage'
import EmployeesPage from '@/pages/EmployeesPage'
import ExpensesPage from '@/pages/ExpensesPage'
import FinishedGoodsPage from '@/pages/FinishedGoodsPage'
import PurchaseOrdersPage from '@/pages/PurchaseOrdersPage'
import BatchesPage from '@/pages/batches/BatchesPage'
import NewBatchPage from '@/pages/batches/NewBatchPage'
import ViewBatchesPage from '@/pages/batches/ViewBatchesPage'
import ManageBatchesPage from '@/pages/batches/ManageBatchesPage'
import ModifyBatchPage from '@/pages/batches/manage/ModifyBatchPage'
import MixingPage from '@/pages/batches/MixingPage'
import NJPPage from '@/pages/batches/NJPPage'
import AssemblyPage from '@/pages/batches/AssemblyPage'
import BatchPricingPage from '@/pages/batches/BatchPricingPage'
import BatchReportsPage from '@/pages/batches/BatchReportsPage'
import WorkflowPage from '@/pages/batches/WorkflowPage'

function Layout() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/brands" element={<BrandsPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/raw-materials" element={<RawMaterialsPage />} />
          <Route path="/labels" element={<LabelsPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/finished-goods" element={<FinishedGoodsPage />} />
          <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="/batches" element={<BatchesPage />} />
          <Route path="/batches/workflow" element={<WorkflowPage />} />
          <Route path="/batches/new" element={<NewBatchPage />} />
          <Route path="/batches/view" element={<ViewBatchesPage />} />
          <Route path="/batches/manage" element={<ManageBatchesPage />} />
          <Route path="/batches/manage/modify" element={<ModifyBatchPage />} />
          <Route path="/batches/mixing" element={<MixingPage />} />
          <Route path="/batches/njp" element={<NJPPage />} />
          <Route path="/batches/assembly" element={<AssemblyPage />} />
          <Route path="/batches/pricing" element={<BatchPricingPage />} />
          <Route path="/batches/reports" element={<BatchReportsPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Layout />
    </ToastProvider>
  )
}
