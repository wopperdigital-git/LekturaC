export interface PhotoCredit {
  name: string
  url: string
  source: 'pexels' | 'url'
}

export interface Photo {
  url: string
  alt: string
  credit: PhotoCredit
}
