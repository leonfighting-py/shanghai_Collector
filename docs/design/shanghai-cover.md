# 上海城市生活雷达封面

2026-09-14。用户选择设计感插画。使用内置 imagegen 生成原创底图，转换为 1536×1024 JPEG（约 635 KiB），保存在 `public/images/shanghai-radar-cover.jpg`。生成原图保留在 Codex generated_images 中。页面默认播放由该插画制成的本地循环 MP4，无需外部视频服务；另提供独立 GIF。

循环素材时长 8 秒，建筑保持稳定，江面水波和倒影连续变化，首尾按周期衔接。网页叠加雷达扫描和灯点呼吸。支持暂停、滚出视口暂停、系统减少动态效果。`NEXT_PUBLIC_HERO_VIDEO_URL` 仍可覆盖为自定义视频，视频失败时回退插画；留空使用本地循环 MP4。首屏标题、描述和活动入口为 HTML 文本。手机裁切聚焦中央地标。

2026-09-15 加强水面运动：水平位移叠加幅度从 6 px 提高到 22 px，竖直位移从 1.5 px 提高到 5 px，主要水波周期从 4 秒缩短为 2 秒；扩大近岸水面运动范围，并柔化游船周围的遮罩。默认视频地址带 v=2 以更新浏览器缓存。

## 动图文件与重建

`public/media/shanghai-radar-loop.gif` 是 960×640、12 fps 的独立循环 GIF。`public/media/shanghai-radar-loop.mp4` 是 1536×1024、24 fps 的 H.264 视频，首页使用该文件以减少传输体积。静态 JPEG 作为首帧和减少动态效果时的封面。

使用 FFmpeg 对现有插画水面进行周期性像素位移；这是一幅局部运动插画，不是新拍摄的视频。运行 `node scripts/render-shanghai-cover.mjs` 可重建两种格式，需要本地安装 FFmpeg。

## 最终生成提示词（内置 imagegen）

Use case: stylized-concept. Create a polished original editorial illustration asset for a Shanghai city-life discovery website hero, landscape 1536x1024. Full bleed artwork only, absolutely no typography, no lettering, no logos, no interface. Art direction: sophisticated architectural screenprint / contemporary travel editorial, exquisite geometric shapes with subtle fine-grain paper texture, strong composition, deep midnight petrol and teal, glowing soft apricot and coral, warm cream highlights. Shanghai viewed across the Huangpu river: unmistakable Oriental Pearl Tower with two spheres and thin spire slightly left of center (at 48% width), Shanghai Tower graceful twisting outline and Shanghai World Financial Center trapezoid aperture to its right, Jin Mao stepped silhouette. Skyline occupies middle third of image, sky upper 40%, river lower 35%. A large pale apricot setting sun at 72% width 30% height behind layered teal skyline. Curving quiet river with delicate horizontal apricot reflections and a tiny ferry in lower right. Small foreground silhouettes of Shanghai plane-tree foliage and Bund architecture at far left and right edges, carefully restrained. Architecture elegant and recognizable, not photorealistic, not childish cartoon, no futuristic fantasy city, no generic skyscrapers replacing landmarks. Background sky dark teal at upper left, hazy warm teal at horizon, a little visual grain. Lower left quarter relatively dark and quiet for future white headline overlay; put all major recognizable landmarks in central 35-70% width so mobile center crop retains Shanghai identity. Wide cinematic balanced scene, collectible art print quality, tasteful contrast, crisp silhouette edges, subtle depth.
