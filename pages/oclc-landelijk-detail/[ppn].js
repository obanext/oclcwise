import { OclcNbcPlusDetailPage } from "../oclc-luisterboek-detail/[ppn].js";

export default function OclcLandelijkDetailPage() {
  return (
    <OclcNbcPlusDetailPage
      detailType="landelijk"
      apiRoute="/api/oclc-landelijk-detail"
    />
  );
}
