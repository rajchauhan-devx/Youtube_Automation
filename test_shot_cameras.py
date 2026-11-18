#!/usr/bin/env python3
"""
Test script to verify camera framing and basic setup for all 16 shots.
Renders 1 frame per shot and computes initial SSIM / MSE against reference frame.
"""

import sys
import os
import math
import cv2
import numpy as np

# Path to Blender binary
BLENDER_BIN = r"C:\Users\zrajc\blender\blender-5.3.0-windows-x64\blender.exe"
print("Blender binary verified:", os.path.exists(BLENDER_BIN))
