import { OclcNbcPlusDetailPage } from "../../components/OclcNbcPlusDetailPage.js";

export default function OclcLuisterboekDetailPage() {
  return (
    <OclcNbcPlusDetailPage
      detailType="luisterboek"
      apiRoute="/api/oclc-luisterboek-detail"
    />
  );
}
