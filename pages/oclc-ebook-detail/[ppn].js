import { OclcNbcPlusDetailPage } from "../oclc-luisterboek-detail/[ppn].js";

export default function OclcEbookDetailPage() {
  return (
    <OclcNbcPlusDetailPage
      detailType="ebook"
      apiRoute="/api/oclc-ebook-detail"
    />
  );
}
