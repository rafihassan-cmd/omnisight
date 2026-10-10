import pytest
from fastapi.testclient import TestClient

from omnisight.api.deps import get_store
from omnisight.api.main import create_app
from omnisight.services.datasets import DatasetStore


@pytest.fixture
def client():
    app = create_app()
    store = DatasetStore()
    app.dependency_overrides[get_store] = lambda: store
    return TestClient(app)


def upload(client, csv=b'Name,Age,Age,price\nAlice,22,23,$10\nBob,24,25,\n'):
    response = client.post('/api/v1/datasets', files={'file': ('t.csv', csv, 'text/csv')})
    assert response.status_code == 201, response.text
    return response.json()


def op(client, state, name, params, **extra):
    return client.post(f"/api/v1/datasets/{state['dataset_id']}/operations",
                       json={'name': name, 'params': params, 'expected_version': state['version'], **extra})


def test_complete_part1_and_existing_part2_flow(client):
    state = upload(client)
    ds = state['dataset_id']
    assert state['version'] == 0 and not state['can_proceed']
    assert [c['name'] for c in state['preview']['columns']] == ['Name', 'Age', 'Age', 'price']
    assert state['preview']['rows'][0]['c1'] != state['preview']['rows'][0]['c2']
    assert op(client, state, 'handle_missing', {'columns': ['c3'], 'strategy': 'drop'}).status_code == 422
    state = op(client, state, 'rename_column', {'column_id': 'c2', 'new_name': 'Age_2'}).json()
    assert state['can_proceed'] and state['version'] == 1
    state = op(client, state, 'remove_affix', {'column_id': 'c3', 'mode': 'prefix', 'text': '$',
                                            'convert_to_numeric': True}).json()
    assert state['preview']['rows'][0]['c3'] == 10 and state['preview']['rows'][1]['c3'] is None
    state = op(client, state, 'handle_missing', {'columns': ['c3'], 'strategy': 'mean'}).json()
    assert state['preview']['rows'][1]['c3'] == 10
    assert len(client.get(f'/api/v1/datasets/{ds}/history').json()) == 3
    state = client.post(f'/api/v1/datasets/{ds}/undo', json={'expected_version': 3}).json()
    assert state['version'] == 4 and state['history_count'] == 2
    assert state['preview']['rows'][1]['c3'] is None
    exported = client.get(f'/api/v1/datasets/{ds}/export')
    assert exported.text.splitlines()[0] == 'Name,Age,Age_2,price'
    state = client.post(f'/api/v1/datasets/{ds}/reset', json={'expected_version': 4}).json()
    assert state['version'] == 5 and state['history_count'] == 0 and not state['can_proceed']
    assert state['preview']['rows'][0]['c3'] == '$10'


def test_discard_selected_occurrence_preview_and_undo_restore_exact_data(client):
    state = upload(client, b'A,A,A\n10,20,30\n')
    ds = state['dataset_id']
    state = op(client, state, 'discard_column', {'column_id': 'c1'},
               preview={'column_ids': ['c1', 'c2'], 'limit': 10}).json()
    assert [c['id'] for c in state['preview']['columns']] == ['c2']
    assert state['preview']['rows'] == [{'c2': 30}]
    assert not state['can_proceed']
    state = op(client, state, 'rename_column', {'column_id': 'c2', 'new_name': 'Third'}).json()
    assert state['can_proceed']
    state = client.post(f'/api/v1/datasets/{ds}/undo', json={'expected_version': 2}).json()
    assert not state['can_proceed']
    state = client.post(f'/api/v1/datasets/{ds}/undo', json={'expected_version': 3}).json()
    assert state['preview']['rows'] == [{'c0': 10, 'c1': 20, 'c2': 30}]


def test_failed_apply_and_dryrun_leave_data_history_version_unchanged(client):
    state = upload(client, b'price\n$10\n$abc\n')
    ds = state['dataset_id']
    params = {'column_id': 'c0', 'mode': 'prefix', 'text': '$', 'convert_to_numeric': True}
    body = {'name': 'remove_affix', 'params': params, 'expected_version': 0}
    for suffix in ('operations/preview', 'operations'):
        r = client.post(f'/api/v1/datasets/{ds}/{suffix}', json=body)
        assert r.status_code == 422 and r.json()['invalid_count'] == 1
        assert r.json()['invalid_rows'] == [{'row': 2, 'value': 'abc'}]
    assert client.get(f'/api/v1/datasets/{ds}').json()['version'] == 0
    assert client.get(f'/api/v1/datasets/{ds}/history').json() == []
    assert client.get(f'/api/v1/datasets/{ds}/preview').json() == state['preview']


def test_valid_dryrun_does_not_commit_and_preview_paginates_without_mutating(client):
    state = upload(client, b'p,q\n$1,x\n$2,y\n$3,z\n')
    ds = state['dataset_id']
    body = {'name': 'remove_affix', 'params': {'column_id': 'c0', 'mode': 'prefix', 'text': '$',
                                             'convert_to_numeric': True}, 'expected_version': 0}
    r = client.post(f'/api/v1/datasets/{ds}/operations/preview', json=body)
    assert r.status_code == 200 and r.json()['sample'][0]['after'] == 1
    page = client.get(f'/api/v1/datasets/{ds}/preview',
                      params={'offset': 1, 'limit': 1, 'column_ids': ['c1']}).json()
    assert page['rows'] == [{'c1': 'y'}] and page['total_rows'] == 3 and page['version'] == 0
    assert client.get(f'/api/v1/datasets/{ds}').json()['columns'] == 2


def test_stale_changes_rejected_even_after_undo(client):
    original = upload(client, b'A\n1\n')
    current = op(client, original, 'rename_column', {'column_id': 'c0', 'new_name': 'B'}).json()
    r = op(client, original, 'rename_column', {'column_id': 'c0', 'new_name': 'C'})
    assert r.status_code == 409 and r.json()['current_version'] == 1
    client.post(f"/api/v1/datasets/{current['dataset_id']}/undo", json={'expected_version': 1})
    assert op(client, original, 'rename_column', {'column_id': 'c0', 'new_name': 'C'}).status_code == 409


def test_bad_requests_and_invalid_preview_do_not_commit(client):
    state = upload(client, b'A\n1\n')
    ds = state['dataset_id']
    assert op(client, state, 'rename_column', {'column_id': 'c0', 'new_name': 'B'},
              preview={'column_ids': ['nope']}).status_code == 422
    assert op(client, state, 'discard_column', {'column_id': 'c0'}).status_code == 422
    assert op(client, state, 'bogus', {}).status_code == 422
    assert op(client, state, 'remove_affix', {'column_id': 'c0', 'mode': 'prefix', 'text': '',
                                           'convert_to_numeric': True}).status_code == 422
    assert client.post(f'/api/v1/datasets/{ds}/operations', json={'name': 'bogus'}).status_code == 422
    assert client.get('/api/v1/datasets/nope').status_code == 404
    assert client.get(f'/api/v1/datasets/{ds}/preview?limit=501').status_code == 422
    assert client.get(f'/api/v1/datasets/{ds}').json()['version'] == 0


def test_rename_with_other_duplicate_groups_remaining_is_allowed(client):
    state = upload(client, b'A,A,B,B\n1,2,3,4\n')
    result = op(client, state, 'rename_column', {'column_id': 'c1', 'new_name': 'Other_A'})
    assert result.status_code == 200
    assert result.json()['duplicate_column_groups'] == [{'name': 'B', 'column_ids': ['c2', 'c3']}]


def test_meta_exposes_only_agreed_operations(client):
    result = client.get('/api/v1/meta').json()
    assert set(result['operations']) == {'rename_column', 'discard_column', 'remove_affix', 'handle_missing'}
    assert result['operations']['remove_affix']['has_preview']
    assert result['conversion_targets'] == ['numeric']


def test_parsed_infinity_is_reported_as_validation_error(client):
    state = upload(client, b'price\ninf\n12\n')
    response = op(client, state, 'remove_affix',
                  {'column_id': 'c0', 'mode': 'prefix', 'text': '$', 'convert_to_numeric': True})
    assert response.status_code == 422
    assert response.json()['invalid_rows'] == [{'row': 1, 'value': 'inf'}]
    assert client.get(f"/api/v1/datasets/{state['dataset_id']}").json()['version'] == 0
