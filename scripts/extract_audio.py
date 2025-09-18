import os
from moviepy.editor import VideoFileClip

def extract_audio(video_path, audio_path):
    if not os.path.exists(video_path):
        raise Exception(f"Error: The video file {video_path} does not exist.")
    
    video = VideoFileClip(video_path)
    audio = video.audio
    audio.write_audiofile(audio_path)

if __name__ == "__main__":
    import sys
    video_path = sys.argv[1]
    audio_path = sys.argv[2]
    extract_audio(video_path, audio_path)

