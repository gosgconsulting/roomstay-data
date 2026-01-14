/**
 * Hook for managing Edit Source Modal state
 * 
 * This hook centralizes all state management for the Edit Source modal, including:
 * - Modal open/close state
 * - Step navigation (6-step wizard)
 * - Active channel tab selection
 * - Search query for filtering dimension values
 * - URL query parameter handling (?edit=true)
 * 
 * @module useEditSourceModal
 */

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Modal step type (1-6 step wizard)
 */
export type ModalStep = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Return type for useEditSourceModal hook
 */
interface UseEditSourceModalReturn {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Function to set modal open state */
  setIsOpen: (open: boolean) => void;
  /** Current step in the wizard (1-6) */
  modalStep: ModalStep;
  /** Function to set the modal step */
  setModalStep: (step: ModalStep) => void;
  /** Currently active channel tab in the modal */
  activeChannelTab: 'metasearch' | 'sem' | 'social' | null;
  /** Function to set the active channel tab */
  setActiveChannelTab: (channel: 'metasearch' | 'sem' | 'social' | null) => void;
  /** Search query for filtering dimension values */
  searchQuery: string;
  /** Function to set the search query */
  setSearchQuery: (query: string) => void;
  /** Navigate to next step */
  handleNext: () => void;
  /** Navigate to previous step */
  handleBack: () => void;
  /** Reset modal to initial state */
  resetModal: () => void;
}

/**
 * Hook for managing Edit Source Modal state
 * 
 * Provides centralized state management for the Edit Source modal wizard.
 * Automatically opens the modal if ?edit=true is present in the URL.
 * 
 * @param onClose - Optional callback when modal closes
 * @param onOpen - Optional callback when modal opens
 * @returns Modal state and control functions
 * 
 * @example
 * ```tsx
 * const {
 *   isOpen,
 *   setIsOpen,
 *   modalStep,
 *   handleNext,
 *   handleBack
 * } = useEditSourceModal(
 *   () => console.log('Modal closed'),
 *   () => console.log('Modal opened')
 * );
 * ```
 */
export function useEditSourceModal(
  onClose?: () => void,
  onOpen?: () => void
): UseEditSourceModalReturn {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>(1);
  const [activeChannelTab, setActiveChannelTab] = useState<
    'metasearch' | 'sem' | 'social' | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Open modal if ?edit=true in URL
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsOpen(true);
      setSearchParams({}, { replace: true }); // Remove the query param
    }
  }, [searchParams, setSearchParams]);

  const handleSetIsOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open && onOpen) {
        onOpen();
      } else if (!open && onClose) {
        onClose();
      }
    },
    [onOpen, onClose]
  );

  const handleNext = useCallback(() => {
    if (modalStep < 6) {
      setModalStep((modalStep + 1) as ModalStep);
    }
  }, [modalStep]);

  const handleBack = useCallback(() => {
    if (modalStep > 1) {
      setModalStep((modalStep - 1) as ModalStep);
    }
  }, [modalStep]);

  const resetModal = useCallback(() => {
    setModalStep(1);
    setActiveChannelTab(null);
    setSearchQuery('');
  }, []);

  return {
    isOpen,
    setIsOpen: handleSetIsOpen,
    modalStep,
    setModalStep,
    activeChannelTab,
    setActiveChannelTab,
    searchQuery,
    setSearchQuery,
    handleNext,
    handleBack,
    resetModal,
  };
}
