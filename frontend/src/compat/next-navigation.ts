import { useLocation, useNavigate, useSearchParams as useRouterSearchParams } from 'react-router-dom'

export function useRouter() {
  const navigate = useNavigate()
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1)
  }
}

export function useSearchParams() {
  const [params] = useRouterSearchParams()
  return params
}

export function usePathname() {
  return useLocation().pathname
}
