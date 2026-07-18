import { useRef, useEffect, useState } from "react";

interface DragPosition {
  x: number;
  y: number;
}

interface DraggableOptions {
  defaultX?: number;
  defaultY?: number;
}

export function useDraggable(elementId: string, options: DraggableOptions = {}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<DragPosition>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<DragPosition>({ x: 0, y: 0 });
  const elementStartPos = useRef<DragPosition>({ x: 0, y: 0 });

  // Load initial position from localStorage
  useEffect(() => {
    if (!elementRef.current) return;

    const savedPosition = localStorage.getItem(`dragPos_${elementId}`);

    if (savedPosition) {
      try {
        const pos = JSON.parse(savedPosition);
        setPosition(pos);
        elementRef.current.style.left = `${pos.x}px`;
        elementRef.current.style.top = `${pos.y}px`;
      } catch (error) {
        // Silently continue on parse error
      }
    }
  }, [elementId]);

  // Handle mouse down
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!elementRef.current) return;

    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
    };
    elementStartPos.current = { ...position };

    if (elementRef.current) {
      elementRef.current.style.cursor = "grabbing";
    }
  };

  // Handle mouse move
  useEffect(() => {
    if (!isDragging || !elementRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;

      let newX = elementStartPos.current.x + deltaX;
      let newY = elementStartPos.current.y + deltaY;

      // Constrain to viewport
      const maxX = window.innerWidth - (elementRef.current?.offsetWidth || 0);
      const maxY = window.innerHeight - (elementRef.current?.offsetHeight || 0);

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      setPosition({ x: newX, y: newY });
      if (elementRef.current) {
        elementRef.current.style.left = `${newX}px`;
        elementRef.current.style.top = `${newY}px`;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (elementRef.current) {
        elementRef.current.style.cursor = "grab";
      }
      // Save position to localStorage
      localStorage.setItem(
        `dragPos_${elementId}`,
        JSON.stringify(position)
      );
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, elementId, position]);

  // Apply cursor style
  useEffect(() => {
    if (elementRef.current) {
      elementRef.current.style.cursor = isDragging ? "grabbing" : "grab";
      elementRef.current.style.userSelect = "none";
    }
  }, [isDragging]);

  return {
    elementRef,
    position,
    isDragging,
    handleMouseDown,
  };
}
