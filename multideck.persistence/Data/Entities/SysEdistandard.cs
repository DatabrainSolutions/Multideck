using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdistandard
{
    public string EdistdCode { get; set; } = null!;

    public string EdistdName { get; set; } = null!;

    public string? EdistdDescription { get; set; }

    public bool EdistdIsStructuredEdi { get; set; }

    public bool EdistdIsActive { get; set; }

    public int EdistdSortOrder { get; set; }

    public virtual ICollection<EdiBatch> EdiBatches { get; set; } = new List<EdiBatch>();

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiPartnerIdentifier> EdiPartnerIdentifiers { get; set; } = new List<EdiPartnerIdentifier>();

    public virtual ICollection<EdiSchemaDefinition> EdiSchemaDefinitions { get; set; } = new List<EdiSchemaDefinition>();

    public virtual ICollection<EdiTradingPartner> EdiTradingPartners { get; set; } = new List<EdiTradingPartner>();

    public virtual ICollection<SysEdiacknowledgementType> SysEdiacknowledgementTypes { get; set; } = new List<SysEdiacknowledgementType>();
}
