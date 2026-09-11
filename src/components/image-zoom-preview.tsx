import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type ImageZoomPreviewProps = {
  accessibilityLabel: string;
  sourceUri: string;
  style: StyleProp<ImageStyle>;
  onError?: () => void;
};

export function ImageZoomPreview({ accessibilityLabel, sourceUri, style, onError }: ImageZoomPreviewProps) {
  const [visible, setVisible] = useState(false);
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.94);
      opacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale, visible]);

  return (
    <>
      <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={() => setVisible(true)} style={[styles.thumbnailContainer, style as StyleProp<ViewStyle>]}>
        <Image cachePolicy="memory-disk" contentFit="cover" onError={onError} recyclingKey={sourceUri} source={{ uri: sourceUri }} style={styles.thumbnail} transition={120} />
      </Pressable>
      <Modal transparent animationType="none" visible={visible} onRequestClose={() => setVisible(false)}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable accessibilityLabel="Cerrar imagen ampliada" onPress={() => setVisible(false)} style={StyleSheet.absoluteFill} />
          <Animated.View style={[styles.preview, { transform: [{ scale }] }]}>
            <Image cachePolicy="memory-disk" contentFit="contain" recyclingKey={sourceUri} source={{ uri: sourceUri }} style={styles.image} transition={120} />
            <Pressable accessibilityLabel="Cerrar imagen ampliada" onPress={() => setVisible(false)} style={styles.closeButton}>
              <ThemedText style={styles.closeText}>×</ThemedText>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.84)', flex: 1, justifyContent: 'center', padding: 24 },
  preview: { height: '78%', maxWidth: 520, width: '100%' },
  thumbnailContainer: { overflow: 'hidden' },
  thumbnail: { height: '100%', width: '100%' },
  image: { backgroundColor: '#111111', borderRadius: 18, height: '100%', width: '100%' },
  closeButton: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)', borderRadius: 18, height: 36, justifyContent: 'center', position: 'absolute', right: 10, top: 10, width: 36 },
  closeText: { color: '#FFFFFF', fontSize: 27, lineHeight: 30 },
});
