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
import InventoryPage from '@/pages/InventoryPage'
import InventoryManagementPage from '@/pages/InventoryManagementPage'
import InventoryRecordsPage from '@/pages/InventoryRecordsPage'
import ManufacturingReportsPage from '@/pages/ManufacturingReportsPage'
import StartManufacturingPage from '@/pages/StartManufacturingPage'
import ItemsPurchaseOrdersPage from '@/pages/ItemsPurchaseOrdersPage'
import PurchaseOrdersPage from '@/pages/PurchaseOrdersPage'
import RequestToQuotePage from '@/pages/RequestToQuotePage'
import QuotesPage from '@/pages/QuotesPage'
import InvoicesPage from '@/pages/InvoicesPage'
import SendItemsPage from '@/pages/SendItemsPage'
import ProductPriceCalculatorPage from '@/pages/ProductPriceCalculatorPage'
import MixingPage from '@/pages/manufacturing/MixingPage'
import EncapsulationPage from '@/pages/manufacturing/EncapsulationPage'
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
          <Route path="/inventory-management" element={<InventoryManagementPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory-records" element={<InventoryRecordsPage />} />
          <Route path="/finished-goods" element={<FinishedGoodsPage />} />
          <Route path="/manufacturing-reports" element={<ManufacturingReportsPage />} />
          <Route path="/start-manufacturing" element={<StartManufacturingPage />} />
          <Route path="/items-purchase-orders" element={<ItemsPurchaseOrdersPage />} />
          <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="/request-to-quote" element={<RequestToQuotePage />} />
          <Route path="/quotes" element={<QuotesPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/send-items" element={<SendItemsPage />} />
          <Route path="/mixing" element={<MixingPage />} />
          <Route path="/encapsulation" element={<EncapsulationPage />} />
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
