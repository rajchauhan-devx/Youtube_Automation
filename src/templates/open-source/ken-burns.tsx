"use client";
import React from "react";

interface KenBurnsProps {
  imageUrl?: string;
  duration?: number;
  scale?: number;
  translateX?: number;
  translateY?: number;
}

export const KenBurns: React.FC<KenBurnsProps> = ({
  imageUrl = "https://images.unsplash.com/photo-1682687220742-aba13b6e50ba",
  duration = 20,
  scale = 1.5,
  translateX = -50,
  translateY = -30,
}) => {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "transparent",
        overflow: "hidden",
      }}
    >
      <img
        src={imageUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          animation: `kenBurns ${duration}s ease-out forwards`,
        }}
      />
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes kenBurns {
            0% {
              transform: scale(1) translate(0, 0);
            }
            100% {
              transform: scale(${scale})
                translate(${translateX}px, ${translateY}px);
            }
          }
        `,
      }} />
    </div>
  );
};

export default KenBurns;
