import { OclcNbcPlusDetailPage } from "../../components/OclcNbcPlusDetailPage.js";

export default function OclcLandelijkDetailPage() {
  return (
    <OclcNbcPlusDetailPage
      detailType="landelijk"
      apiRoute="/api/oclc-landelijk-detail"
    />
  );
}
