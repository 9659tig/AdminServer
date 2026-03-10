export interface VideoInfo {
    name: string;
    title: string;
    id: string;
    videoId: string;
    exist: boolean;
}

export interface VideoInfoDetail {
    videoId: string;
    uploadDate: string;
    thumbnail: string;
    videoTitle: string;
    viewCount: string;
    videoTag: string;
    videoTime: string;
}
