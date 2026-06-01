package imgutil

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"math"
	"os/exec"

	"golang.org/x/image/draw"
)

const MaxEdge = 2048

type ConvertOptions struct {
	Format  string
	Quality int
}

func Convert(r io.Reader, opts ConvertOptions) ([]byte, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return nil, err
	}

	rgba := ensureRGBA(img)
	rgba = downsampleIfNeeded(rgba)

	switch opts.Format {
	case "jpeg", "jpg":
		return encodeJPEG(rgba, opts.Quality)
	case "avif":
		return encodeAVIF(rgba, opts.Quality)
	case "jxl":
		return encodeJXL(rgba, opts.Quality)
	default:
		return encodePNG(rgba)
	}
}

func ConvertSingle(img image.Image, format string, quality int) ([]byte, error) {
	rgba := ensureRGBA(img)
	rgba = downsampleIfNeeded(rgba)

	switch format {
	case "jpeg", "jpg":
		return encodeJPEG(rgba, quality)
	case "avif":
		return encodeAVIF(rgba, quality)
	case "jxl":
		return encodeJXL(rgba, quality)
	default:
		return encodePNG(rgba)
	}
}

func encodePNG(rgba *image.RGBA) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, rgba); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func encodeJPEG(rgba *image.RGBA, quality int) ([]byte, error) {
	if quality <= 0 {
		quality = 92
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, rgba, &jpeg.Options{Quality: quality}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func encodeAVIF(rgba *image.RGBA, quality int) ([]byte, error) {
	if quality <= 0 {
		quality = 60
	}

	pngData, err := encodePNG(rgba)
	if err != nil {
		return nil, fmt.Errorf("avif: failed to encode intermediate PNG: %w", err)
	}

	avifenc, err := exec.LookPath("avifenc")
	if err != nil {
		return nil, fmt.Errorf("avif: avifenc not found in PATH (install libavif: brew install libavif / apt install libavif-bin)")
	}

	cmd := exec.Command(avifenc, "--stdin", "--stdout", "-q", fmt.Sprintf("%d", quality), "-y", "444", "--")
	cmd.Stdin = bytes.NewReader(pngData)

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("avif: avifenc failed: %w, stderr: %s", err, stderr.String())
	}

	return out.Bytes(), nil
}

func encodeJXL(rgba *image.RGBA, quality int) ([]byte, error) {
	if quality <= 0 {
		quality = 90
	}

	pngData, err := encodePNG(rgba)
	if err != nil {
		return nil, fmt.Errorf("jxl: failed to encode intermediate PNG: %w", err)
	}

	cjxl, err := exec.LookPath("cjxl")
	if err != nil {
		return nil, fmt.Errorf("jxl: cjxl not found in PATH (install jpeg-xl: brew install jpeg-xl / apt install libjxl-tools)")
	}

	cmd := exec.Command(cjxl, "--stdin", "--stdout", "-q", fmt.Sprintf("%d", quality))
	cmd.Stdin = bytes.NewReader(pngData)

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("jxl: cjxl failed: %w, stderr: %s", err, stderr.String())
	}

	return out.Bytes(), nil
}

func ensureRGBA(img image.Image) *image.RGBA {
	if rgba, ok := img.(*image.RGBA); ok {
		return rgba
	}

	bounds := img.Bounds()
	rgba := image.NewRGBA(bounds)
	draw.Draw(rgba, bounds, img, bounds.Min, draw.Src)
	return rgba
}

func downsampleIfNeeded(img *image.RGBA) *image.RGBA {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	if w <= MaxEdge && h <= MaxEdge {
		return img
	}

	scale := math.Min(float64(MaxEdge)/float64(w), float64(MaxEdge)/float64(h))
	newW := int(math.Round(float64(w) * scale))
	newH := int(math.Round(float64(h) * scale))

	resized := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.CatmullRom.Scale(resized, resized.Bounds(), img, bounds, draw.Over, nil)
	return resized
}

func FormatContentType(format string) string {
	switch format {
	case "jpeg", "jpg":
		return "image/jpeg"
	case "avif":
		return "image/avif"
	case "jxl":
		return "image/jxl"
	default:
		return "image/png"
	}
}

func FormatExtension(format string) string {
	switch format {
	case "jpeg", "jpg":
		return ".jpg"
	case "avif":
		return ".avif"
	case "jxl":
		return ".jxl"
	default:
		return ".png"
	}
}

func SupportedFormats() []string {
	return []string{"png", "jpeg", "avif", "jxl"}
}

func AvailableFormats() map[string]bool {
	result := map[string]bool{
		"png":  true,
		"jpeg": true,
	}
	_, err := exec.LookPath("avifenc")
	result["avif"] = err == nil
	_, err = exec.LookPath("cjxl")
	result["jxl"] = err == nil
	return result
}

func IsTransparent(img image.Image) bool {
	bounds := img.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			_, _, _, a := color.NRGBAModel.Convert(img.At(x, y)).RGBA()
			if a < 65535 {
				return true
			}
		}
	}
	return false
}
