import { Route, Routes } from 'react-router-dom'

import { ToastProvider } from '@/components/ui'
import HomePage from '@/pages/HomePage'
import BrandsPage from '@/pages/BrandsPage'
import ProductsPage from '@/pages/ProductsPage'
import RawMaterialsPage from '@/pages/RawMaterialsPage'
import LabelsPage from '@/pages/LabelsPage'
import BottlesLidsPage from '@/pages/BottlesLidsPage'
import VendorsPage from '@/pages/VendorsPage'
import EmployeesPage from '@/pages/EmployeesPage'
import ExpensesPage from '@/pages/ExpensesPage'
import FinishedGoodsPage from '@/pages/FinishedGoodsPage'
import ManufacturingReportsPage from '@/pages/ManufacturingReportsPage'
import PurchaseOrdersPage from '@/pages/PurchaseOrdersPage'
import ProductPriceCalculatorPage from '@/pages/ProductPriceCalculatorPage'
import MixingPage from '@/pages/manufacturing/MixingPage'
import NJPPage from '@/pages/manufacturing/NJPPage'
import AssemblyPage from '@/pages/manufacturing/AssemblyPage'

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
          <Route path="/bottles-lids" element={<BottlesLidsPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/finished-goods" element={<FinishedGoodsPage />} />
          <Route path="/manufacturing-reports" element={<ManufacturingReportsPage />} />
          <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="/mixing" element={<MixingPage />} />
          <Route path="/njp" element={<NJPPage />} />
          <Route path="/assembly" element={<AssemblyPage />} />
          <Route path="/product-price-calculator" element={<ProductPriceCalculatorPage />} />
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
