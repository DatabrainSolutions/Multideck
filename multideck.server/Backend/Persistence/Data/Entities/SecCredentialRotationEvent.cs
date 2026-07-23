using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecCredentialRotationEvent
{
    public Guid SeccredRotId { get; set; }

    public Guid SeccredRotCredentialId { get; set; }

    public string SeccredRotEventTypeCode { get; set; } = null!;

    public string? SeccredRotPreviousVersionRef { get; set; }

    public string? SeccredRotNewVersionRef { get; set; }

    public DateTime SeccredRotRotatedAt { get; set; }

    public Guid? SeccredRotRotatedBy { get; set; }

    public string? SeccredRotNotes { get; set; }

    public virtual SecCredentialReference SeccredRotCredential { get; set; } = null!;

    public virtual CmpUser? SeccredRotRotatedByNavigation { get; set; }
}
