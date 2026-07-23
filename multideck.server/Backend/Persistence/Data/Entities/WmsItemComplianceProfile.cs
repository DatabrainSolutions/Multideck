using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsItemComplianceProfile
{
    public Guid WmsitemCompId { get; set; }

    public Guid WmsitemCompItemId { get; set; }

    public string WmsitemCompJurisdictionCode { get; set; } = null!;

    public string? WmsitemCompHscode { get; set; }

    public string? WmsitemCompEccncode { get; set; }

    public string? WmsitemCompControlTypeCode { get; set; }

    public bool WmsitemCompLicenseRequired { get; set; }

    public bool WmsitemCompImportRestriction { get; set; }

    public bool WmsitemCompExportRestriction { get; set; }

    public bool WmsitemCompExciseRelevant { get; set; }

    public bool WmsitemCompSpsrelevant { get; set; }

    public Guid? WmsitemCompTceproductControlRuleId { get; set; }

    public string? WmsitemCompNotes { get; set; }

    public bool WmsitemCompIsActive { get; set; }

    public DateTime WmsitemCompCreatedAt { get; set; }

    public virtual WmsItem WmsitemCompItem { get; set; } = null!;
}
