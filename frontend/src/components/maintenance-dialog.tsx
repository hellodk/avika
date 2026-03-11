"use client";

import { useState, useEffect } from "react";
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Layout, Settings2, Code, Eye } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MaintenanceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    template?: any;
    onSuccess: () => void;
    projectId?: string;
}

export function MaintenanceDialog({ open, onOpenChange, template, onSuccess, projectId }: MaintenanceDialogProps) {
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [htmlContent, setHtmlContent] = useState("");
    const [cssContent, setCssContent] = useState("");
    const [isDefault, setIsDefault] = useState(false);

    useEffect(() => {
        if (template) {
            setName(template.name || "");
            setDescription(template.description || "");
            setHtmlContent(template.html_content || "");
            setCssContent(template.css_content || "");
            setIsDefault(template.is_default || false);
        } else {
            setName("");
            setDescription("");
            setHtmlContent("<h1>Maintenance in Progress</h1>\n<p>We'll be back soon!</p>");
            setCssContent("body { font-family: sans-serif; text-align: center; padding: 50px; }");
            setIsDefault(false);
        }
    }, [template, open]);

    const handleSave = async () => {
        if (!name || !htmlContent) {
            toast.error("Name and HTML content are required");
            return;
        }

        setLoading(true);
        try {
            const method = template ? "PUT" : "POST";
            const url = template 
                ? `/api/maintenance/templates/${template.id}` 
                : "/api/maintenance/templates";

            const res = await apiFetch(url, {
                method,
                body: JSON.stringify({
                    template_id: template?.id,
                    project_id: projectId,
                    name,
                    description,
                    html_content: htmlContent,
                    css_content: cssContent,
                    is_default: isDefault,
                }),
            });

            if (!res.ok) throw new Error("Failed to save template");
            
            toast.success(template ? "Template updated" : "Template created");
            onSuccess();
            onOpenChange(false);
        } catch (err: any) {
            toast.error("Error saving template", { description: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl bg-[rgb(var(--theme-surface))] border-[rgb(var(--theme-border))]">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center gap-2">
                        <Layout className="h-5 w-5 text-amber-500" />
                        {template ? "Edit Template" : "New Maintenance Template"}
                    </DialogTitle>
                    <DialogDescription>
                        Define the content and style of your maintenance page.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="general" className="w-full">
                    <TabsList className="bg-black/20 mb-4">
                        <TabsTrigger value="general" className="gap-2">
                            <Settings2 className="h-4 w-4" />
                            General
                        </TabsTrigger>
                        <TabsTrigger value="editor" className="gap-2">
                            <Code className="h-4 w-4" />
                            Code
                        </TabsTrigger>
                        <TabsTrigger value="preview" className="gap-2">
                            <Eye className="h-4 w-4" />
                            Preview
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="general" className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Template Name</Label>
                                <Input 
                                    id="name" 
                                    value={name} 
                                    onChange={(e) => setName(e.target.value)} 
                                    className="bg-black/20 border-[rgb(var(--theme-border))]"
                                    placeholder="e.g. Modern Maintenance"
                                />
                            </div>
                            <div className="flex items-end pb-3">
                                <div className="flex items-center space-x-2">
                                    <Switch 
                                        id="default" 
                                        checked={isDefault} 
                                        onCheckedChange={setIsDefault} 
                                    />
                                    <Label htmlFor="default">Set as Project Default</Label>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="desc">Description (Optional)</Label>
                            <Input 
                                id="desc" 
                                value={description} 
                                onChange={(e) => setDescription(e.target.value)} 
                                className="bg-black/20 border-[rgb(var(--theme-border))]"
                                placeholder="Brief description for internal reference"
                            />
                        </div>
                    </TabsContent>

                    <TabsContent value="editor" className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4 h-[400px]">
                            <div className="flex flex-col space-y-2">
                                <Label>HTML Content</Label>
                                <Textarea 
                                    value={htmlContent} 
                                    onChange={(e) => setHtmlContent(e.target.value)}
                                    className="flex-1 font-mono text-xs bg-black/40 border-[rgb(var(--theme-border))]"
                                    placeholder="<!-- HTML here -->"
                                />
                            </div>
                            <div className="flex flex-col space-y-2">
                                <Label>CSS Styles</Label>
                                <Textarea 
                                    value={cssContent} 
                                    onChange={(e) => setCssContent(e.target.value)}
                                    className="flex-1 font-mono text-xs bg-black/40 border-[rgb(var(--theme-border))]"
                                    placeholder="/* CSS here */"
                                />
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="preview" className="py-2">
                        <div className="border rounded-lg h-[400px] bg-white overflow-hidden">
                            <iframe 
                                title="preview"
                                className="w-full h-full border-none"
                                srcDoc={`
                                    <html>
                                        <head><style>${cssContent}</style></head>
                                        <body>${htmlContent}</body>
                                    </html>
                                `}
                            />
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter className="border-t border-[rgb(var(--theme-border))] pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={loading} className="bg-amber-500 hover:bg-amber-600 text-black font-medium min-w-[100px]">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (template ? "Update" : "Create")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
