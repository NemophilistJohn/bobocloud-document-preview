import {
  createIcons,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListTree,
  RotateCw,
  Search,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide';

const ICONS = {
  ChevronLeft,
  ChevronRight,
  FileText,
  ListTree,
  RotateCw,
  Search,
  X,
  ZoomIn,
  ZoomOut
};

export function renderIcons(root = document) {
  createIcons({ icons: ICONS, attrs: { 'aria-hidden': 'true', width: 16, height: 16 }, root });
}
