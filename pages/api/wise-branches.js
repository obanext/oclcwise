import { requireGet } from "../../utils/api.js";
import { WISE_BASE_URL, WISE_BRANCH_ID } from "../../utils/wiseConfig.js";
import { fetchWiseResponse } from "../../utils/wiseResponse.js";

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const text = (value) => {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

export default async function handler(req, res) {
  if (!requireGet(req, res)) return;

  const params = new URLSearchParams({
    branchGroupType: "CG0",
    branchGroupId: WISE_BRANCH_ID,
    onlyActiveBranchesInLibraryNetwork: "true",
  });
  const call = await fetchWiseResponse(`${WISE_BASE_URL}/branch?${params.toString()}`);

  if (!call.ok) {
    return res.status(call.status || 502).json({
      error: "Vestigingen ophalen mislukt",
      branches: [],
      debug: { calls: [call] },
    });
  }

  const branches = asArray(call.body?.items || call.body)
    .map((branch) => ({
      branchId: text(branch?.branchId),
      name: text(branch?.name || branch?.branchId),
    }))
    .filter((branch) => branch.branchId && branch.name)
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  return res.status(200).json({
    branches,
    debug: { calls: [call] },
  });
}
