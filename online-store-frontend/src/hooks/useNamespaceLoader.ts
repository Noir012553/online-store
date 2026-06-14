import { useEffect } from 'react';
import { useLanguage, type Namespace } from '../lib/i18n';

/**
 * Auto-load specific namespace when component mounts
 * Implements Phase 3 Task #9: Namespace fragmentation (route-based)
 *
 * Example usage:
 *   useNamespaceLoader('admin');  // Load admin namespace
 *   useNamespaceLoader(['checkout', 'products']);  // Load multiple
 */
export function useNamespaceLoader(namespaces: Namespace | Namespace[]) {
  const { loadNamespace } = useLanguage();

  useEffect(() => {
    const namespacesToLoad = Array.isArray(namespaces) ? namespaces : [namespaces];

    // Load each namespace in parallel
    namespacesToLoad.forEach((ns) => {
      loadNamespace(ns);
    });
  }, [namespaces, loadNamespace]);
}
