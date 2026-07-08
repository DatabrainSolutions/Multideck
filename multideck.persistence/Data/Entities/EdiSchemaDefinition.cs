using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiSchemaDefinition
{
    public Guid EdischemaId { get; set; }

    public string EdischemaStandardCode { get; set; } = null!;

    public string EdischemaMessageTypeCode { get; set; } = null!;

    public string? EdischemaStandardVersion { get; set; }

    public string EdischemaName { get; set; } = null!;

    public string? EdischemaSchemaRef { get; set; }

    public string EdischemaSchemaJson { get; set; } = null!;

    public bool EdischemaIsActive { get; set; }

    public DateTime EdischemaCreatedAt { get; set; }

    public virtual ICollection<EdiMappingProfile> EdiMappingProfiles { get; set; } = new List<EdiMappingProfile>();

    public virtual SysEdimessageType EdischemaMessageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdistandard EdischemaStandardCodeNavigation { get; set; } = null!;
}
