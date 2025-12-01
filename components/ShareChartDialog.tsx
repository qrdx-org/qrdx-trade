'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Share2, Copy, Check, Twitter, MessageCircle, Send, Facebook } from 'lucide-react'

interface ShareChartDialogProps {
  symbol: string
  currentUrl: string
}

export function ShareChartDialog({ symbol, currentUrl }: ShareChartDialogProps) {
  const [open, setOpen] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)

  // Remove existing query parameters to get base URL
  const baseUrl = currentUrl.split('?')[0]
  const shareUrl = `${baseUrl}?share=true`
  const embedUrl = `${baseUrl}?embed=true`
  const embedCode = `<iframe src="${embedUrl}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`

  const copyToClipboard = async (text: string, type: 'link' | 'embed') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'link') {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } else {
        setCopiedEmbed(true)
        setTimeout(() => setCopiedEmbed(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const shareToTwitter = () => {
    const text = `Check out ${symbol} chart on QRDX Trade!`
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`
    window.open(url, '_blank', 'width=550,height=420')
  }

  const shareToTelegram = () => {
    const text = `Check out ${symbol} chart on QRDX Trade!`
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const shareToWhatsApp = () => {
    const text = `Check out ${symbol} chart on QRDX Trade! ${shareUrl}`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const shareToFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    window.open(url, '_blank', 'width=550,height=420')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          <Share2 className="h-4 w-4" />
          Share Chart
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Share {symbol} Chart</DialogTitle>
          <DialogDescription>
            Share this chart with your community or embed it on your website
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="social" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="social">Social Media</TabsTrigger>
            <TabsTrigger value="link">Link</TabsTrigger>
            <TabsTrigger value="embed">Embed</TabsTrigger>
          </TabsList>

          <TabsContent value="social" className="space-y-4 mt-4">
            <div className="text-sm text-muted-foreground mb-4">
              Share on your favorite platform
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={shareToTwitter}
              >
                <Twitter className="h-5 w-5 text-[#1DA1F2]" />
                Share on Twitter
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={shareToTelegram}
              >
                <Send className="h-5 w-5 text-[#0088cc]" />
                Share on Telegram
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={shareToWhatsApp}
              >
                <MessageCircle className="h-5 w-5 text-[#25D366]" />
                Share on WhatsApp
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={shareToFacebook}
              >
                <Facebook className="h-5 w-5 text-[#1877F2]" />
                Share on Facebook
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="link" className="space-y-4 mt-4">
            <div className="text-sm text-muted-foreground mb-2">
              Copy and share this link
            </div>
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(shareUrl, 'link')}
              >
                {copiedLink ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              This link includes the QRDX watermark for branding
            </div>
          </TabsContent>

          <TabsContent value="embed" className="space-y-4 mt-4">
            <div className="text-sm text-muted-foreground mb-2">
              Embed this chart on your website
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Embed URL</label>
                <div className="flex gap-2">
                  <Input
                    value={embedUrl}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(embedUrl, 'embed')}
                  >
                    {copiedEmbed ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">HTML Code</label>
                <div className="relative">
                  <textarea
                    value={embedCode}
                    readOnly
                    rows={3}
                    className="w-full p-3 text-xs font-mono bg-muted rounded-md border resize-none"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-7"
                    onClick={() => copyToClipboard(embedCode, 'embed')}
                  >
                    {copiedEmbed ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Commission Tab (Greyed Out) */}
        <div className="mt-4 p-4 rounded-lg border border-dashed bg-muted/30 opacity-50">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium mb-1">Earn Commissions</h4>
              <p className="text-xs text-muted-foreground">
                Get 10% commission on trades from your referrals (Coming Soon)
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Enable
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
