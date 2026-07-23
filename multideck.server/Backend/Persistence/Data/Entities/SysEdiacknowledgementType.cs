using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdiacknowledgementType
{
    public string EdiackTypeCode { get; set; } = null!;

    public string EdiackTypeName { get; set; } = null!;

    public string? EdiackTypeDescription { get; set; }

    public string? EdiackTypeStandardCode { get; set; }

    public bool EdiackTypeIsActive { get; set; }

    public int EdiackTypeSortOrder { get; set; }

    public virtual ICollection<EdiAcknowledgement> EdiAcknowledgements { get; set; } = new List<EdiAcknowledgement>();

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual SysEdistandard? EdiackTypeStandardCodeNavigation { get; set; }
}
