import React, { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';

const rescueWaveWordmark = require('../../assets/brand/rescuewave-logo.png');

export default function SplashView() {
  const wordmarkOpacity = useSharedValue(0);
  const wordmarkTranslate = useSharedValue(12);

  useEffect(() => {
    wordmarkOpacity.value = withDelay(240, withTiming(1, { duration: 420 }));
    wordmarkTranslate.value = withDelay(240, withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }));
  }, []);

  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmarkOpacity.value, transform: [{ translateY: wordmarkTranslate.value }] }));

  return (
    <LinearGradient colors={[colors.navy, colors.navyDeep]} style={StyleSheet.absoluteFill}>
      <View style={styles.center}>
        <Animated.View style={wordmarkStyle}>
          <Image source={rescueWaveWordmark} resizeMode="contain" style={styles.wordmarkImage} />
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmarkImage: { width: 276, height: 276, borderRadius: 18 },
});
