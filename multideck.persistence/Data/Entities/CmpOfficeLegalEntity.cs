using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CmpOfficeLegalEntity
{
    public Guid OfficeLegalEntityId { get; set; }

    public Guid OfficeId { get; set; }

    public Guid LegalEntityId { get; set; }

    public bool OfficeLegalEntityIsDefault { get; set; }

    public bool OfficeLegalEntityIsActive { get; set; }

    public DateTime OfficeLegalEntityCreatedAt { get; set; }

    public virtual CmpLegalEntity LegalEntity { get; set; } = null!;

    public virtual CmpOffice Office { get; set; } = null!;
}
