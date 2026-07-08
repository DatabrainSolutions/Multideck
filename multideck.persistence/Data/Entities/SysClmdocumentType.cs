using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmdocumentType
{
    public string ClmdocumentTypeCode { get; set; } = null!;

    public string ClmdocumentTypeName { get; set; } = null!;

    public string? ClmdocumentTypeDescription { get; set; }

    public bool ClmdocumentTypeIsEvidence { get; set; }

    public bool ClmdocumentTypeIsActive { get; set; }

    public int ClmdocumentTypeSortOrder { get; set; }

    public virtual ICollection<ClmClaimDocument> ClmClaimDocuments { get; set; } = new List<ClmClaimDocument>();

    public virtual ICollection<ClmEvidenceItem> ClmEvidenceItems { get; set; } = new List<ClmEvidenceItem>();

    public virtual ICollection<ClmPolicyDocument> ClmPolicyDocuments { get; set; } = new List<ClmPolicyDocument>();
}
