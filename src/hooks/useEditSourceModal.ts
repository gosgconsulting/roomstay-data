/**
 * Hook for managing Edit Source Modal state
 * Handles modal open/close state and step navigation
 */

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export type ModalStep = 1 | 2 | 3 | 4 | 5 | 6;

interface UseEditSourceModalReturn {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  modalStep: ModalStep;
  setModalStep: (step: ModalStep) => void;
  activeChannelTab: 'metasearch' | 'sem' | 'social' | null;
  setActiveChannelTab: (channel: 'metasearch' | 'sem' | 'social' | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleNext: () => void;
  handleBack: () => void;
  resetModal: () => void;
}

/**
 * Hook for managing Edit Source Modal state
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
